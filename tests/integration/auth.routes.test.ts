import '../setup';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { createContainer } from '../../src/config/container';
import { UserModel } from '../../src/modules/user/user.model';
import { RefreshTokenModel } from '../../src/modules/auth/auth.model';

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
    quit: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    }),
  }),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheDelPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/infrastructure/queue/queue.service', () => ({
  queueService: {
    addEmailJob: jest.fn().mockResolvedValue({}),
    getEmailQueue: jest.fn().mockReturnValue({ process: jest.fn(), on: jest.fn() }),
    getQueueStats: jest.fn().mockResolvedValue({}),
    close: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/socket/socket.service', () => ({
  socketService: {
    initialize: jest.fn(),
    emitToUser: jest.fn(),
    isUserOnline: jest.fn().mockReturnValue(false),
  },
}));

jest.mock('../../src/core/utils/audit.logger', () => ({ auditLog: jest.fn() }));
jest.mock('../../src/core/utils/abuse.detector', () => ({
  trackLoginFailure: jest.fn(),
  trackApplicationSubmission: jest.fn(),
}));

const TEST_USER = {
  name: 'Integration Tester',
  email: 'integration@test.com',
  password: 'TestPass123!',
};

// Build app once using real container (backed by test MongoDB)
const container = createContainer();
const app = createApp(container);

describe('Auth Routes — Integration', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI!);
    }
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: TEST_USER.email });
    await RefreshTokenModel.deleteMany({});
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await UserModel.deleteMany({ email: TEST_USER.email });
    await RefreshTokenModel.deleteMany({});
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register and return tokens', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(TEST_USER);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.email).toBe(TEST_USER.email);
    });

    it('should return 409 on duplicate email', async () => {
      await request(app).post('/api/v1/auth/register').send(TEST_USER);
      const res = await request(app).post('/api/v1/auth/register').send(TEST_USER);
      expect(res.status).toBe(409);
    });

    it('should return 422 for invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, email: 'not-an-email' });
      expect(res.status).toBe(422);
      expect(res.body.error.fields).toBeDefined();
    });

    it('should return 422 for short password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...TEST_USER, password: 'short' });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(TEST_USER);
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password });
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_USER.email, password: 'WrongPass999!' });
      expect(res.status).toBe(401);
    });

    it('should return 401 for unknown user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@test.com', password: 'SomePass123!' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should issue new tokens and rotate the refresh token', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send(TEST_USER);
      const { refreshToken } = reg.body.data.tokens;

      const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken); // rotated
    });

    it('should return 422 for missing refreshToken', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});
      expect(res.status).toBe(422);
    });

    it('should return 401 for invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'garbage-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send(TEST_USER);
      const { accessToken } = reg.body.data.tokens;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    it('should return 401 without token', async () => {
      expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    });

    it('should return 401 with malformed token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should invalidate refresh token', async () => {
      const reg = await request(app).post('/api/v1/auth/register').send(TEST_USER);
      const { refreshToken } = reg.body.data.tokens;

      expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(200);

      // Refresh should now fail — token was deleted
      expect(
        (await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status,
      ).toBe(401);
    });
  });
});
