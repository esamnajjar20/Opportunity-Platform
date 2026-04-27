import { IOpportunityRepository } from '../opportunity/repository/opportunity.repository.interface';
import { IUserRepository } from '../user/repository/user.repository.interface';
import { AppError } from '../../shared/errors/AppError';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../core/utils/logger';
import { OpportunityEntity } from '../../shared/types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ScoredOpportunity {
  opportunity: OpportunityEntity;
  score: number;
  matchReasons: string[];
}

const CACHE_TTL = 300;
const MAX_RECOMMENDATIONS = 20;

export class RecommendationService {
  constructor(
    private readonly opportunityRepo: IOpportunityRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async getRecommendations(userId: string): Promise<ScoredOpportunity[]> {
    const cacheKey = `recommendations:${userId}`;
    const cached = await cacheGet<ScoredOpportunity[]>(cacheKey);
    if (cached) {
      logger.debug(`Cache hit: recommendations for ${userId}`);
      return cached;
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw AppError.notFound('User');

    const userTags = user.tags ?? [];
    const userLocation = user.location ?? '';
    const locationRegex = userLocation ? escapeRegex(userLocation) : undefined;

    const opportunities = await this.opportunityRepo.findActiveWithFilters(
      userTags,
      locationRegex,
      50,
    );

    const scored: ScoredOpportunity[] = opportunities
      .map((opp) => this._score(opp, userTags, userLocation))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDATIONS);

    await cacheSet(cacheKey, scored, CACHE_TTL);
    return scored;
  }

  async getByPreferences(tags: string[], location: string, limit = 10): Promise<ScoredOpportunity[]> {
    const safeTags = tags.filter((t) => typeof t === 'string').map((t) => t.slice(0, 50));
    const locationRegex = location ? escapeRegex(location) : undefined;

    const opportunities = await this.opportunityRepo.findActiveWithFilters(
      safeTags,
      locationRegex,
      100,
    );

    return opportunities
      .map((opp) => this._score(opp, safeTags, location))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private _score(opp: OpportunityEntity, userTags: string[], userLocation: string): ScoredOpportunity {
    const matchReasons: string[] = [];
    let score = 0;

    if (userTags.length > 0) {
      const oppTags = opp.tags.map((t) => t.toLowerCase());
      const normalizedUserTags = userTags.map((t) => t.toLowerCase());
      const matchedTags = normalizedUserTags.filter((t) => oppTags.includes(t));
      if (matchedTags.length > 0) {
        const tagScore = Math.round((matchedTags.length / normalizedUserTags.length) * 10);
        score += tagScore;
        matchReasons.push(`${matchedTags.length} matching skill(s): ${matchedTags.slice(0, 3).join(', ')}`);
      }
    }

    if (userLocation && opp.location) {
      const userCity = userLocation.toLowerCase().trim();
      const oppLocation = opp.location.toLowerCase().trim();
      if (oppLocation.includes(userCity) || userCity.includes(oppLocation)) {
        score += 5;
        matchReasons.push(`Location match: ${opp.location}`);
      }
    }

    if (opp.isRemote) {
      score += 2;
      matchReasons.push('Remote opportunity');
    }

    return { opportunity: opp, score, matchReasons };
  }
}
