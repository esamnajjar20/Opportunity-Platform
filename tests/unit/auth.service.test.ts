import '../setup';
import { AuthService } from '../../src/modules/auth/auth.service';
import { IUserRepository } from '../../src/modules/user/repository/user.repository.interface';
import { IAuthRepository } from '../../src/modules/auth/repository/auth.repository.interface';
import { AppError } from '../../src/shared/errors/AppError';
import { UserEntity, RefreshTokenEntity } from '../../src/shared/types';

// Mock infrastructure — no Mongoose models touched here
jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    }),
  }),
}));
jest.mock('../../src/core/events/event.bus', () => ({
  eventBus: { emit: jest.fn(), on: jest.fn() },
}));
jest.mock('../../src/core/utils/audit.logger', () => ({ auditLog: jest.fn() }));
jest.mock('../../src/core/utils/abuse.detector', () => ({
  trackLoginFailure: jest.fn(),
  trackApplicationSubmission: jest.fn(),
}));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── Mock repository factory helpers ─────────────────────────────────────────

const mockUser: UserEntity = {
  id: 'user-id-123',
  name: 'Test User',
  email: 'test@example.com',
  password: 'hashed-password',
  role: 'user',
  tags: [],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildUserRepo = (overrides: Partial<IUserRepository> = {}): IUserRepository => ({
  findById: jest.fn().mockResolvedValue(mockUser),
  findByIdPublic: jest.fn().mockResolvedValue({ ...mockUser, password: undefined }),
  findByEmail: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue(mockUser),
  update: jest.fn().mockResolvedValue(mockUser),
  deactivate: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const buildAuthRepo = (overrides: Partial<IAuthRepository> = {}): IAuthRepository => ({
  createRefreshToken: jest.fn().mockResolvedValue({
    id: 'token-id',
    tokenHash: 'hash',
    userId: 'user-id-123',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
  } as RefreshTokenEntity),
  findRefreshToken: jest.fn().mockResolvedValue(null),
  deleteRefreshToken: jest.fn().mockResolvedValue(true),
  deleteAllRefreshTokensForUser: jest.fn().mockResolvedValue(3),
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      const userRepo = buildUserRepo({ findByEmail: jest.fn().mockResolvedValue(null) });
      const authRepo = buildAuthRepo();
      const service = new AuthService(userRepo, authRepo);

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongPass123!',
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user).not.toHaveProperty('password');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw 409 when email already exists', async () => {
      const userRepo = buildUserRepo({
        findByEmail: jest.fn().mockResolvedValue(mockUser),
      });
      const service = new AuthService(userRepo, buildAuthRepo());

      await expect(
        service.register({ name: 'Test', email: 'test@example.com', password: 'StrongPass123!' }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    });

    it('should always create user with role "user"', async () => {
      const userRepo = buildUserRepo({ findByEmail: jest.fn().mockResolvedValue(null) });
      const authRepo = buildAuthRepo();
      const service = new AuthService(userRepo, authRepo);

      await service.register({ name: 'Test', email: 'test@example.com', password: 'StrongPass123!' });

      const createCall = (userRepo.create as jest.Mock).mock.calls[0][0];
      expect(createCall.role).toBe('user');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const userRepo = buildUserRepo({
        findByEmail: jest.fn().mockResolvedValue(mockUser),
      });
      const service = new AuthService(userRepo, buildAuthRepo());

      const result = await service.login({
        email: 'test@example.com',
        password: 'StrongPass123!',
        ip: '127.0.0.1',
      });

      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 for non-existent user', async () => {
      const userRepo = buildUserRepo({ findByEmail: jest.fn().mockResolvedValue(null) });
      const service = new AuthService(userRepo, buildAuthRepo());

      await expect(
        service.login({ email: 'ghost@test.com', password: 'wrong', ip: '127.0.0.1' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('should return 403 for deactivated users', async () => {
      const userRepo = buildUserRepo({
        findByEmail: jest.fn().mockResolvedValue({ ...mockUser, isActive: false }),
      });
      const service = new AuthService(userRepo, buildAuthRepo());

      await expect(
        service.login({ email: 'test@example.com', password: 'StrongPass123!', ip: '127.0.0.1' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('logout', () => {
    it('should delete the refresh token by hash', async () => {
      const authRepo = buildAuthRepo();
      const service = new AuthService(buildUserRepo(), authRepo);

      await service.logout({ refreshToken: 'some-raw-token' });

      expect(authRepo.deleteRefreshToken).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hex
      );
    });
  });

  describe('logoutAll', () => {
    it('should delete all refresh tokens for a user', async () => {
      const authRepo = buildAuthRepo();
      const service = new AuthService(buildUserRepo(), authRepo);

      await service.logoutAll('user-id-123');

      expect(authRepo.deleteAllRefreshTokensForUser).toHaveBeenCalledWith('user-id-123');
    });
  });

  describe('refreshTokens', () => {
    it('should throw 401 when token hash not found', async () => {
      const authRepo = buildAuthRepo({ findRefreshToken: jest.fn().mockResolvedValue(null) });
      const userRepo = buildUserRepo({ findByEmail: jest.fn().mockResolvedValue(mockUser) });
      const service = new AuthService(userRepo, authRepo);

      // Need a valid JWT to get past verifyRefreshToken — generate one first
      const loginResult = await service.login({
        email: 'test@example.com',
        password: 'StrongPass123!',
      });

      // Now reset the mock to simulate "token not found"
      (authRepo.findRefreshToken as jest.Mock).mockResolvedValue(null);

      await expect(
        service.refreshTokens(loginResult.tokens.refreshToken),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});
