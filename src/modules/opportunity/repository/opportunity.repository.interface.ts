import { OpportunityEntity } from '../../../shared/types';
import { PaginatedData } from '../../../core/utils/pagination';
import { FilterQuery } from '../opportunity.search.types';

export interface CreateOpportunityData {
  title: string;
  description: string;
  type: string;
  location: string;
  isRemote: boolean;
  tags: string[];
  requirements: string[];
  status: string;
  createdBy: string;
  salary?: { min: number; max: number; currency: string };
  deadline?: Date;
}

export type UpdateOpportunityData = Partial<Omit<CreateOpportunityData, 'createdBy'>>;

export interface OpportunitySearchParams {
  filter: FilterQuery;
  sort: Record<string, 1 | -1>;
  useTextSearch: boolean;
  page: number;
  limit: number;
}

/**
 * IOpportunityRepository — all persistence for the Opportunity domain.
 */
export interface IOpportunityRepository {
  findById(id: string): Promise<OpportunityEntity | null>;

  search(params: OpportunitySearchParams): Promise<PaginatedData<OpportunityEntity>>;

  create(data: CreateOpportunityData): Promise<OpportunityEntity>;

  update(id: string, data: UpdateOpportunityData): Promise<OpportunityEntity | null>;

  delete(id: string): Promise<boolean>;

  incrementApplicantsCount(id: string): Promise<void>;

  findByOwner(userId: string, page: number, limit: number): Promise<PaginatedData<OpportunityEntity>>;

  findActiveWithFilters(
    tags: string[],
    locationRegex?: string,
    limit?: number,
  ): Promise<OpportunityEntity[]>;
}
