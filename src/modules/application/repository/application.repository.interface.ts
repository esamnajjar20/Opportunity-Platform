import { ApplicationEntity, ApplicationStatus, ApplicationStatusHistoryEntry } from '../../../shared/types';
import { PaginatedData } from '../../../core/utils/pagination';

export interface CreateApplicationData {
  opportunityId: string;
  applicantId: string;
  coverLetter?: string;
  resumeUrl?: string;
  statusHistory: ApplicationStatusHistoryEntry[];
}

export interface UpdateApplicationStatusData {
  status: ApplicationStatus;
  notes?: string;
  historyEntry: ApplicationStatusHistoryEntry;
}

/**
 * IApplicationRepository — all persistence for the Application domain.
 */
export interface IApplicationRepository {
  findById(id: string): Promise<ApplicationEntity | null>;

  /** Returns application with populated opportunityId and applicantId */
  findByIdPopulated(id: string): Promise<ApplicationEntity | null>;

  create(data: CreateApplicationData): Promise<ApplicationEntity>;

  updateStatus(id: string, data: UpdateApplicationStatusData): Promise<ApplicationEntity | null>;

  findByApplicant(
    applicantId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<ApplicationEntity>>;

  findByOpportunity(
    opportunityId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<ApplicationEntity>>;
}
