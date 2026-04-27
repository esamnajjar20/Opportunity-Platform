import { z } from 'zod';
import { FilterQuery } from './opportunity.search.types';

// Re-export so IOpportunityRepository interface can import it
export type { FilterQuery };

/**
 * Escapes all regex special characters from user-supplied strings.
 * Prevents ReDoS attacks via catastrophic backtracking in MongoDB $regex queries.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SearchOpportunityDtoSchema = z.object({
  q: z.string().max(200, 'Search query must not exceed 200 characters').optional(),
  type: z.enum(['job', 'internship', 'volunteer', 'freelance', 'contract']).optional(),
  location: z.string().optional(),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((t) => t.trim()) : undefined)),
  isRemote: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  status: z.enum(['draft', 'active', 'closed', 'archived']).optional().default('active'),
  salaryMin: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (!isNaN(v) && v >= 0), 'salaryMin must be a positive number'),
  salaryMax: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (!isNaN(v) && v >= 0), 'salaryMax must be a positive number'),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('10').transform(Number),
  sortBy: z.enum(['createdAt', 'deadline', 'applicantsCount']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type SearchOpportunityDto = z.infer<typeof SearchOpportunityDtoSchema>;

export interface SearchResult {
  filter: FilterQuery;
  sort: Record<string, 1 | -1>;
  useTextSearch: boolean;
}

export class OpportunitySearch {
  buildQuery(dto: SearchOpportunityDto): SearchResult {
    const filter: FilterQuery = {};
    let useTextSearch = false;

    if (dto.q && dto.q.trim().length > 0) {
      filter.$text = { $search: dto.q.trim() };
      useTextSearch = true;
    }

    if (dto.status) filter.status = dto.status;
    if (dto.type)   filter.type   = dto.type;

    if (dto.location) {
      filter.location = { $regex: escapeRegex(dto.location), $options: 'i' };
    }

    if (dto.isRemote !== undefined) filter.isRemote = dto.isRemote;

    if (dto.tags && dto.tags.length > 0) {
      const safeTags = dto.tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.slice(0, 50));
      if (safeTags.length > 0) filter.tags = { $in: safeTags };
    }

    if (dto.salaryMin !== undefined && !isNaN(dto.salaryMin)) {
      filter['salary.min'] = { $gte: dto.salaryMin };
    }
    if (dto.salaryMax !== undefined && !isNaN(dto.salaryMax)) {
      filter['salary.max'] = { $lte: dto.salaryMax };
    }

    const sort: Record<string, 1 | -1> = {};
    if (useTextSearch) {
      sort.score = { $meta: 'textScore' } as unknown as 1 | -1;
    }
    sort[dto.sortBy] = dto.sortOrder === 'asc' ? 1 : -1;

    return { filter, sort, useTextSearch };
  }
}
