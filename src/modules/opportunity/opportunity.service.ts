import { IOpportunityRepository } from './repository/opportunity.repository.interface';
import { OpportunityEntity } from '../../shared/types';
import { OpportunitySearch, SearchOpportunityDto } from './opportunity.search';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../core/events/event.bus';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../../config/redis';
import { parsePagination, PaginatedData } from '../../core/utils/pagination';
import { logger } from '../../core/utils/logger';
import { z } from 'zod';

const stripHtml = (str: string) => str.replace(/<[^>]*>/g, '').trim();

export const CreateOpportunityDtoSchema = z.object({
  title: z.string().min(5).max(200).transform(stripHtml),
  description: z.string().min(20).max(5000).transform(stripHtml),
  type: z.enum(['job', 'internship', 'volunteer', 'freelance', 'contract']),
  location: z.string().min(2),
  isRemote: z.boolean().default(false),
  tags: z.array(z.string()).max(15).default([]),
  requirements: z.array(z.string()).max(20).default([]),
  salary: z
    .object({
      min: z.number().positive(),
      max: z.number().positive(),
      currency: z.string().default('USD'),
    })
    .refine((d) => d.min <= d.max, {
      message: 'salary.min must not exceed salary.max',
      path: ['min'],
    })
    .optional(),
  deadline: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  status: z.enum(['draft', 'active']).default('active'),
});

export const UpdateOpportunityDtoSchema = CreateOpportunityDtoSchema.partial();

export type CreateOpportunityDto = z.infer<typeof CreateOpportunityDtoSchema>;
export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunityDtoSchema>;

const OPPORTUNITY_CACHE_TTL = 120;
const OPPORTUNITY_LIST_CACHE_TTL = 60;
const opportunityCacheKey = (id: string) => `opportunity:${id}`;
const listCacheKeyPrefix = 'opportunities:list:';

export class OpportunityService {
  private readonly searchEngine = new OpportunitySearch();

  constructor(private readonly opportunityRepo: IOpportunityRepository) {}

  async create(dto: CreateOpportunityDto, createdBy: string): Promise<OpportunityEntity> {
    const opportunity = await this.opportunityRepo.create({ ...dto, createdBy });

    await cacheDelPattern(`${listCacheKeyPrefix}*`);

    eventBus.emit('opportunity:created', {
      opportunityId: opportunity.id,
      title: opportunity.title,
      tags: opportunity.tags,
      location: opportunity.location,
      createdBy,
    });

    logger.info(`Opportunity created: ${opportunity.id} by user ${createdBy}`);
    return opportunity;
  }

  async findById(id: string): Promise<OpportunityEntity> {
    const cacheKey = opportunityCacheKey(id);
    const cached = await cacheGet<OpportunityEntity>(cacheKey);
    if (cached) return cached;

    const opportunity = await this.opportunityRepo.findById(id);
    if (!opportunity) throw AppError.notFound('Opportunity');

    await cacheSet(cacheKey, opportunity, OPPORTUNITY_CACHE_TTL);
    return opportunity;
  }

  async search(dto: SearchOpportunityDto): Promise<PaginatedData<OpportunityEntity>> {
    const pageCacheKey = `${listCacheKeyPrefix}${JSON.stringify(dto)}`;
    const cached = await cacheGet<PaginatedData<OpportunityEntity>>(pageCacheKey);
    if (cached) return cached;

    const { filter, sort, useTextSearch } = this.searchEngine.buildQuery(dto);
    const { page, limit } = parsePagination({ page: dto.page, limit: dto.limit });

    const result = await this.opportunityRepo.search({
      filter,
      sort,
      useTextSearch,
      page,
      limit,
    });

    await cacheSet(pageCacheKey, result, OPPORTUNITY_LIST_CACHE_TTL);
    return result;
  }

  async update(
    id: string,
    dto: UpdateOpportunityDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<OpportunityEntity> {
    const existing = await this.opportunityRepo.findById(id);
    if (!existing) throw AppError.notFound('Opportunity');

    if (existing.createdBy.toString() !== requesterId && requesterRole !== 'admin') {
      throw AppError.forbidden('You can only edit your own opportunities');
    }

    const updated = await this.opportunityRepo.update(id, dto);
    if (!updated) throw AppError.notFound('Opportunity');

    await cacheDel(opportunityCacheKey(id));
    await cacheDelPattern(`${listCacheKeyPrefix}*`);

    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) {
      const k = key as keyof typeof dto;
      if (JSON.stringify(existing[k as keyof OpportunityEntity]) !== JSON.stringify(dto[k])) {
        changes[key] = dto[k];
      }
    }

    eventBus.emit('opportunity:updated', {
      opportunityId: id,
      title: updated.title,
      updatedBy: requesterId,
      changes,
    });

    return updated;
  }

  async delete(id: string, requesterId: string, requesterRole: string): Promise<void> {
    const existing = await this.opportunityRepo.findById(id);
    if (!existing) throw AppError.notFound('Opportunity');

    if (existing.createdBy.toString() !== requesterId && requesterRole !== 'admin') {
      throw AppError.forbidden('You can only delete your own opportunities');
    }

    await this.opportunityRepo.delete(id);
    await cacheDel(opportunityCacheKey(id));
    await cacheDelPattern(`${listCacheKeyPrefix}*`);
    logger.info(`Opportunity ${id} deleted by ${requesterId}`);
  }

  async incrementApplicantsCount(opportunityId: string): Promise<void> {
    await this.opportunityRepo.incrementApplicantsCount(opportunityId);
    await cacheDel(opportunityCacheKey(opportunityId));
  }

  async getMyOpportunities(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedData<OpportunityEntity>> {
    return this.opportunityRepo.findByOwner(userId, page, limit);
  }
}
