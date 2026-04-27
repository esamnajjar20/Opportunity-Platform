import { IApplicationRepository } from './repository/application.repository.interface';
import { IOpportunityRepository } from '../opportunity/repository/opportunity.repository.interface';
import { IUserRepository } from '../user/repository/user.repository.interface';
import { applicationWorkflow } from './application.workflow';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../core/events/event.bus';
import { PaginatedData } from '../../core/utils/pagination';
import { logger } from '../../core/utils/logger';
import { auditLog } from '../../core/utils/audit.logger';
import { trackApplicationSubmission } from '../../core/utils/abuse.detector';
import { ApplicationEntity } from '../../shared/types';
import { z } from 'zod';

const stripHtml = (str: string) => str.replace(/<[^>]*>/g, '').trim();

export const ApplyDtoSchema = z.object({
  opportunityId: z.string().min(1),
  coverLetter: z.string().max(3000).optional().transform((v) => (v ? stripHtml(v) : v)),
  resumeUrl: z.string().url().optional(),
});

export const UpdateStatusDtoSchema = z.object({
  status: z.enum(['reviewing', 'accepted', 'rejected', 'withdrawn']),
  reason: z.string().max(500).optional().transform((v) => (v ? stripHtml(v) : v)),
  notes: z.string().max(1000).optional().transform((v) => (v ? stripHtml(v) : v)),
});

export type ApplyDto = z.infer<typeof ApplyDtoSchema>;
export type UpdateStatusDto = z.infer<typeof UpdateStatusDtoSchema>;

export class ApplicationService {
  constructor(
    private readonly applicationRepo: IApplicationRepository,
    private readonly opportunityRepo: IOpportunityRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async apply(dto: ApplyDto, applicantId: string): Promise<ApplicationEntity> {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) throw AppError.notFound('Opportunity');
    if (opportunity.status !== 'active') {
      throw AppError.badRequest('This opportunity is no longer accepting applications');
    }
    if (opportunity.deadline && opportunity.deadline < new Date()) {
      throw AppError.badRequest('The application deadline has passed');
    }

    let application: ApplicationEntity;
    try {
      application = await this.applicationRepo.create({
        opportunityId: dto.opportunityId,
        applicantId,
        coverLetter: dto.coverLetter,
        resumeUrl: dto.resumeUrl,
        statusHistory: [{ status: 'pending', changedAt: new Date(), changedBy: applicantId }],
      });
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { isDuplicate?: boolean }).isDuplicate) {
        throw AppError.conflict('You have already applied to this opportunity');
      }
      throw err;
    }

    const [applicant] = await Promise.all([
      this.userRepo.findById(applicantId),
      this.opportunityRepo.incrementApplicantsCount(dto.opportunityId),
    ]);

    eventBus.emit('application:submitted', {
      applicationId: application.id,
      opportunityId: dto.opportunityId,
      applicantId,
      applicantEmail: (applicant as { email?: string } | null)?.email ?? '',
      opportunityTitle: opportunity.title,
    });

    logger.info(`Application submitted: ${application.id} for opportunity ${dto.opportunityId}`);
    auditLog({
      action: 'application.submitted',
      userId: applicantId,
      targetId: application.id,
      targetType: 'application',
      meta: { opportunityId: dto.opportunityId },
    });
    trackApplicationSubmission(applicantId);
    return application;
  }

  async updateStatus(
    applicationId: string,
    dto: UpdateStatusDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<ApplicationEntity> {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) throw AppError.notFound('Application');

    if (requesterRole === 'user' && application.applicantId !== requesterId) {
      throw AppError.forbidden('You can only manage your own applications');
    }

    if (requesterRole === 'recruiter') {
      const opportunity = await this.opportunityRepo.findById(application.opportunityId);
      if (!opportunity || String(opportunity.createdBy) !== requesterId) {
        throw AppError.forbidden('You can only manage applications for your own opportunities');
      }
    }

    applicationWorkflow.assertTransition(application.status, dto.status, requesterRole);

    const [applicant, opp] = await Promise.all([
      this.userRepo.findById(application.applicantId),
      this.opportunityRepo.findById(application.opportunityId),
    ]);

    const oldStatus = application.status;

    const updated = await this.applicationRepo.updateStatus(applicationId, {
      status: dto.status,
      notes: dto.notes,
      historyEntry: {
        status: dto.status,
        changedAt: new Date(),
        changedBy: requesterId,
        reason: dto.reason,
      },
    });

    if (!updated) throw AppError.notFound('Application');

    eventBus.emit('application:status:updated', {
      applicationId: application.id,
      opportunityId: application.opportunityId,
      applicantId: application.applicantId,
      applicantEmail: (applicant as { email?: string } | null)?.email ?? '',
      opportunityTitle: (opp as { title?: string } | null)?.title ?? '',
      oldStatus,
      newStatus: dto.status,
    });

    logger.info(`Application ${applicationId} status: ${oldStatus} → ${dto.status}`);
    auditLog({
      action: 'application.status_changed',
      userId: requesterId,
      targetId: applicationId,
      targetType: 'application',
      meta: { oldStatus, newStatus: dto.status },
    });

    return updated;
  }

  async getMyApplications(userId: string, page = 1, limit = 10): Promise<PaginatedData<ApplicationEntity>> {
    return this.applicationRepo.findByApplicant(userId, page, limit);
  }

  async getOpportunityApplications(
    opportunityId: string,
    requesterId: string,
    requesterRole: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedData<ApplicationEntity>> {
    if (requesterRole !== 'admin') {
      const opportunity = await this.opportunityRepo.findById(opportunityId);
      if (!opportunity || String(opportunity.createdBy) !== requesterId) {
        throw AppError.forbidden('You can only view applications for your own opportunities');
      }
    }
    return this.applicationRepo.findByOpportunity(opportunityId, page, limit);
  }

  async getById(
    applicationId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<ApplicationEntity> {
    const application = await this.applicationRepo.findByIdPopulated(applicationId);
    if (!application) throw AppError.notFound('Application');

    if (requesterRole === 'user' && application.applicantId !== requesterId) {
      throw AppError.forbidden('Access denied');
    }

    if (requesterRole === 'recruiter') {
      const opportunity = await this.opportunityRepo.findById(application.opportunityId);
      if (!opportunity || String(opportunity.createdBy) !== requesterId) {
        throw AppError.forbidden('Access denied');
      }
    }

    return application;
  }
}
