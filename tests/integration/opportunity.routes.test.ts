import '../setup';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { createContainer } from '../../src/config/container';
import { UserModel } from '../../src/modules/user/user.model';
import { OpportunityModel } from '../../src/modules/opportunity/opportunity.model';
import { RefreshTokenModel } from '../../src/modules/auth/auth.model';

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({
    on: jest.fn(), quit: jest.fn(), ping: jest.fn().mockResolvedValue('PONG'),
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
  socketService: { initialize: jest.fn(), emitToUser: jest.fn() },
}));

jest.mock('../../src/core/utils/audit.logger', () => ({ auditLog: jest.fn() }));
jest.mock('../../src/core/utils/abuse.detector', () => ({
  trackLoginFailure: jest.fn(),
  trackApplicationSubmission: jest.fn(),
}));

const RECRUITER = { name: 'Recruiter', email: 'recruiter@test.com', password: 'TestPass123!', role: 'recruiter' };
const REGULAR   = { name: 'User',      email: 'user@test.com',      password: 'TestPass123!', role: 'user' };

const SAMPLE_OPP = {
  title: 'Senior TypeScript Engineer',
  description: 'We are looking for a senior TypeScript engineer with Node.js expertise to join our distributed team.',
  type: 'job',
  location: 'Cairo, Egypt',
  isRemote: true,
  tags: ['typescript', 'nodejs', 'mongodb'],
  requirements: ['3+ years experience'],
};

const container = createContainer();
const app = createApp(container);

describe('Opportunity Routes — Integration', () => {
  let recruiterToken: string;
  let userToken: string;
  let createdId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI!);
    }
    // Register users and capture tokens
    const [rr, ur] = await Promise.all([
      request(app).post('/api/v1/auth/register').send(RECRUITER),
      request(app).post('/api/v1/auth/register').send(REGULAR),
    ]);
    // Force recruiter role directly in DB (register always creates 'user')
    await UserModel.updateOne({ email: RECRUITER.email }, { role: 'recruiter' });
    // Re-login to get token with updated role
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: RECRUITER.email, password: RECRUITER.password });
    recruiterToken = relogin.body.data.tokens.accessToken;
    userToken = ur.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await OpportunityModel.deleteMany({});
    await UserModel.deleteMany({ email: { $in: [RECRUITER.email, REGULAR.email, 'other-recruiter@test.com'] } });
    await RefreshTokenModel.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/v1/opportunities', () => {
    it('allows recruiter to create opportunity', async () => {
      const res = await request(app)
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send(SAMPLE_OPP);

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe(SAMPLE_OPP.title);
      createdId = res.body.data.id ?? res.body.data._id;
    });

    it('denies regular user from creating', async () => {
      const res = await request(app)
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${userToken}`)
        .send(SAMPLE_OPP);
      expect(res.status).toBe(403);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).post('/api/v1/opportunities').send(SAMPLE_OPP);
      expect(res.status).toBe(401);
    });

    it('returns 422 for too-short title', async () => {
      const res = await request(app)
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ ...SAMPLE_OPP, title: 'Hi' });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/opportunities', () => {
    it('lists without auth', async () => {
      const res = await request(app).get('/api/v1/opportunities');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('supports pagination', async () => {
      const res = await request(app).get('/api/v1/opportunities?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/v1/opportunities/:id', () => {
    it('returns opportunity by id', async () => {
      const res = await request(app).get(`/api/v1/opportunities/${createdId}`);
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent id', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      expect((await request(app).get(`/api/v1/opportunities/${fakeId}`)).status).toBe(404);
    });
  });

  describe('PATCH /api/v1/opportunities/:id', () => {
    it('allows owner to update', async () => {
      const res = await request(app)
        .patch(`/api/v1/opportunities/${createdId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ title: 'Updated TypeScript Engineer Role' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated TypeScript Engineer Role');
    });
  });

  describe('DELETE /api/v1/opportunities/:id', () => {
    it('allows owner to delete', async () => {
      const created = await request(app)
        .post('/api/v1/opportunities')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ ...SAMPLE_OPP, title: 'To Be Deleted Opportunity Test' });
      const delId = created.body.data.id ?? created.body.data._id;

      expect((await request(app).delete(`/api/v1/opportunities/${delId}`).set('Authorization', `Bearer ${recruiterToken}`)).status).toBe(204);
      expect((await request(app).get(`/api/v1/opportunities/${delId}`)).status).toBe(404);
    });
  });
});
