import { RefreshTokenEntity } from '../../../shared/types';

export interface CreateRefreshTokenData {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

/**
 * IAuthRepository — all persistence for the auth/session domain.
 * Owns refresh tokens only; user lookups delegate to IUserRepository.
 */
export interface IAuthRepository {
  createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshTokenEntity>;

  findRefreshToken(tokenHash: string): Promise<RefreshTokenEntity | null>;

  deleteRefreshToken(tokenHash: string): Promise<boolean>;

  deleteAllRefreshTokensForUser(userId: string): Promise<number>;
}
