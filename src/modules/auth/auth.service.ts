import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { IUserRepository } from '../user/repository/user.repository.interface';
import { IAuthRepository } from './repository/auth.repository.interface';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  blacklistAccessToken,
  TokenPayload,
} from '../../core/utils/jwt';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../core/events/event.bus';
import { logger } from '../../core/utils/logger';
import { auditLog } from '../../core/utils/audit.logger';
import { trackLoginFailure } from '../../core/utils/abuse.detector';
import { UserEntity, PublicUser } from '../../shared/types';
import { z } from 'zod';

export const RegisterDtoSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof LoginDtoSchema> & { ip?: string };
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface LogoutDto {
  refreshToken: string;
  accessToken?: string;
}

const REFRESH_TOKEN_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly authRepo: IAuthRepository,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) throw AppError.conflict('Email is already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.userRepo.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: passwordHash,
      role: 'user',
    });

    const tokens = await this._generateAndStoreTokens(user);

    eventBus.emit('user:registered', {
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    logger.info(`User registered: ${user.id}`);
    auditLog({ action: 'auth.register', userId: user.id });

    const { password: _, ...publicUser } = user;
    return { user: publicUser as PublicUser, tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(dto.email, true /* includePassword */);

    if (!user) {
      if (dto.ip) trackLoginFailure(dto.ip);
      auditLog({ action: 'auth.login.failure', meta: { reason: 'user_not_found' } });
      throw AppError.unauthorized('Invalid email or password');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      if (dto.ip) trackLoginFailure(dto.ip);
      auditLog({ action: 'auth.login.failure', userId: user.id, meta: { reason: 'bad_password' } });
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      if (dto.ip) trackLoginFailure(dto.ip);
      auditLog({ action: 'auth.login.failure', userId: user.id, meta: { reason: 'account_deactivated' } });
      throw AppError.forbidden('Your account has been deactivated');
    }

    const tokens = await this._generateAndStoreTokens(user);

    logger.info(`User logged in: ${user.id}`);
    auditLog({ action: 'auth.login.success', userId: user.id });

    const { password: _, ...publicUser } = user;
    return { user: publicUser as PublicUser, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const decoded = verifyRefreshToken(refreshToken);
    const incomingHash = hashToken(refreshToken);

    const storedToken = await this.authRepo.findRefreshToken(incomingHash);

    if (!storedToken || storedToken.userId !== decoded.userId) {
      throw AppError.unauthorized('Refresh token not found or already used');
    }

    const user = await this.userRepo.findById(decoded.userId);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('User not found or deactivated');
    }

    await this.authRepo.deleteRefreshToken(incomingHash);
    const tokens = await this._generateAndStoreTokens(user);
    auditLog({ action: 'auth.token.refresh', userId: user.id });
    return tokens;
  }

  async logout(dto: LogoutDto): Promise<void> {
    if (dto.accessToken) await blacklistAccessToken(dto.accessToken);
    await this.authRepo.deleteRefreshToken(hashToken(dto.refreshToken));
    logger.info('User logged out, tokens invalidated');
    auditLog({ action: 'auth.logout' });
  }

  async logoutAll(userId: string, currentAccessToken?: string): Promise<void> {
    if (currentAccessToken) await blacklistAccessToken(currentAccessToken);
    const count = await this.authRepo.deleteAllRefreshTokensForUser(userId);
    logger.info(`All sessions revoked for user ${userId}`, { sessionsRevoked: count });
    auditLog({ action: 'auth.logout_all', userId, meta: { sessionsRevoked: count } });
  }

  private async _generateAndStoreTokens(user: UserEntity): Promise<AuthTokens> {
    const payload: TokenPayload = { userId: user.id, role: user.role };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.authRepo.createRefreshToken({
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
