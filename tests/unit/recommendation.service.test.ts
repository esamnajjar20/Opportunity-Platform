import '../setup';
import { RecommendationService } from '../../src/modules/recommendation/recommendation.service';
import { IUserRepository } from '../../src/modules/user/repository/user.repository.interface';
import { IOpportunityRepository } from '../../src/modules/opportunity/repository/opportunity.repository.interface';
import { OpportunityEntity, UserEntity } from '../../src/shared/types';

jest.mock('../../src/config/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

const makeOpp = (overrides: Partial<OpportunityEntity> = {}): OpportunityEntity => ({
  id: 'opp-1', title: 'Test Opp', description: 'desc', type: 'job',
  status: 'active', location: 'Cairo', isRemote: false,
  tags: ['nodejs'], requirements: [], applicantsCount: 0, createdBy: 'user-1',
  createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

const buildUserRepo = (user: Partial<UserEntity> | null): Partial<IUserRepository> => ({
  findById: jest.fn().mockResolvedValue(
    user ? { id: 'u1', tags: [], location: '', isActive: true, ...user } : null
  ),
});

const buildOpportunityRepo = (opps: OpportunityEntity[]): Partial<IOpportunityRepository> => ({
  findActiveWithFilters: jest.fn().mockResolvedValue(opps),
});

describe('RecommendationService', () => {
  describe('getRecommendations', () => {
    it('returns scored opportunities ranked by score', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([
          makeOpp({ id: 'opp-1', tags: ['nodejs', 'typescript'], location: 'Cairo' }),
          makeOpp({ id: 'opp-2', tags: ['react'], location: 'Alex' }),
        ]) as IOpportunityRepository,
        buildUserRepo({ tags: ['nodejs', 'typescript'], location: 'Cairo' }) as IUserRepository,
      );

      const results = await service.getRecommendations('u1');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].opportunity.id).toBe('opp-1');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].matchReasons.length).toBeGreaterThan(0);
    });

    it('throws 404 if user not found', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([]) as IOpportunityRepository,
        buildUserRepo(null) as IUserRepository,
      );

      await expect(service.getRecommendations('ghost')).rejects.toMatchObject({
        statusCode: 404, code: 'NOT_FOUND',
      });
    });

    it('filters out zero-score opportunities', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([makeOpp({ tags: ['java'], location: 'Tokyo' })]) as IOpportunityRepository,
        buildUserRepo({ tags: ['cobol'], location: 'Mars' }) as IUserRepository,
      );

      const results = await service.getRecommendations('u1');
      results.forEach((r) => expect(r.score).toBeGreaterThan(0));
    });

    it('adds remote bonus to score', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([makeOpp({ tags: ['react'], isRemote: true })]) as IOpportunityRepository,
        buildUserRepo({ tags: ['react'], location: '' }) as IUserRepository,
      );

      const results = await service.getRecommendations('u1');
      const r = results.find((x) => x.opportunity.tags.includes('react'));
      expect(r?.matchReasons).toContain('Remote opportunity');
    });
  });

  describe('getByPreferences', () => {
    it('returns scored results sorted descending', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([
          makeOpp({ id: 'a', tags: ['nodejs', 'typescript'], location: 'Cairo' }),
          makeOpp({ id: 'b', tags: ['nodejs'], location: 'Alex' }),
        ]) as IOpportunityRepository,
        buildUserRepo({}) as IUserRepository,
      );

      const results = await service.getByPreferences(['nodejs', 'typescript'], 'Cairo', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('returns empty array when no matches', async () => {
      const service = new RecommendationService(
        buildOpportunityRepo([]) as IOpportunityRepository,
        buildUserRepo({}) as IUserRepository,
      );
      const results = await service.getByPreferences(['quantum'], 'Antarctica');
      expect(results).toEqual([]);
    });
  });
});
