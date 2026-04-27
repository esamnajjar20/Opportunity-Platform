import { ApplicationModel } from '../application.model';
import {
  IApplicationRepository,
  CreateApplicationData,
  UpdateApplicationStatusData,
} from './application.repository.interface';
import { ApplicationEntity, ApplicationStatusHistoryEntry } from '../../../shared/types';
import { PaginatedData, parsePagination, buildPaginationResult } from '../../../core/utils/pagination';

/**
 * MongoApplicationRepository — sole place in the application module that imports Mongoose.
 */
export class MongoApplicationRepository implements IApplicationRepository {
  async findById(id: string): Promise<ApplicationEntity | null> {
    const doc = await ApplicationModel.findById(id).lean();
    return doc ? this._toEntity(doc) : null;
  }

  async findByIdPopulated(id: string): Promise<ApplicationEntity | null> {
    const doc = await ApplicationModel.findById(id)
      .populate('opportunityId', 'title type location createdBy')
      .populate('applicantId', 'name email')
      .lean();
    return doc ? this._toEntity(doc) : null;
  }

  async create(data: CreateApplicationData): Promise<ApplicationEntity> {
    let doc;
    try {
      doc = await ApplicationModel.create({
        opportunityId: data.opportunityId,
        applicantId: data.applicantId,
        coverLetter: data.coverLetter,
        resumeUrl: data.resumeUrl,
        statusHistory: data.statusHistory,
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        // Re-throw as a plain error — service catches and maps to AppError.conflict
        const dup = new Error('DUPLICATE_APPLICATION');
        (dup as Error & { isDuplicate: boolean }).isDuplicate = true;
        throw dup;
      }
      throw err;
    }
    return this._toEntity(doc.toObject());
  }

  async updateStatus(
    id: string,
    data: UpdateApplicationStatusData,
  ): Promise<ApplicationEntity | null> {
    const doc = await ApplicationModel.findById(id);
    if (!doc) return null;

    doc.status = data.status;
    if (data.notes) doc.notes = data.notes;
    doc.statusHistory.push({
      status: data.historyEntry.status,
      changedAt: data.historyEntry.changedAt,
      changedBy: data.historyEntry.changedBy as unknown as import('mongoose').Types.ObjectId,
      reason: data.historyEntry.reason,
    });

    await doc.save();
    return this._toEntity(doc.toObject());
  }

  async findByApplicant(
    applicantId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<ApplicationEntity>> {
    const { skip } = parsePagination({ page, limit });

    const [docs, total] = await Promise.all([
      ApplicationModel.find({ applicantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('opportunityId', 'title type location status')
        .lean(),
      ApplicationModel.countDocuments({ applicantId }),
    ]);

    return {
      data: docs.map((d) => this._toEntity(d)),
      pagination: buildPaginationResult(page, limit, total),
    };
  }

  async findByOpportunity(
    opportunityId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<ApplicationEntity>> {
    const { skip } = parsePagination({ page, limit });

    const [docs, total] = await Promise.all([
      ApplicationModel.find({ opportunityId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('applicantId', 'name email tags location')
        .lean(),
      ApplicationModel.countDocuments({ opportunityId }),
    ]);

    return {
      data: docs.map((d) => this._toEntity(d)),
      pagination: buildPaginationResult(page, limit, total),
    };
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────
  private _toEntity(doc: Record<string, unknown>): ApplicationEntity {
    const rawHistory = (doc.statusHistory as Record<string, unknown>[]) ?? [];
    const statusHistory: ApplicationStatusHistoryEntry[] = rawHistory.map((h) => ({
      status: h.status as ApplicationEntity['status'],
      changedAt: h.changedAt as Date,
      changedBy: String(h.changedBy),
      reason: h.reason as string | undefined,
    }));

    return {
      id: String(doc._id),
      opportunityId: this._idOrPopulated(doc.opportunityId),
      applicantId: this._idOrPopulated(doc.applicantId),
      status: doc.status as ApplicationEntity['status'],
      coverLetter: doc.coverLetter as string | undefined,
      resumeUrl: doc.resumeUrl as string | undefined,
      notes: doc.notes as string | undefined,
      statusHistory,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  /** Handle both plain ObjectId and populated subdoc */
  private _idOrPopulated(val: unknown): string {
    if (val && typeof val === 'object' && '_id' in (val as object)) {
      return String((val as { _id: unknown })._id);
    }
    return String(val);
  }
}
