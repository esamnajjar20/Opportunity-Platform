import { OpportunityModel } from '../opportunity.model';
import {
  IOpportunityRepository,
  CreateOpportunityData,
  UpdateOpportunityData,
  OpportunitySearchParams,
} from './opportunity.repository.interface';
import { OpportunityEntity } from '../../../shared/types';
import { PaginatedData, parsePagination, buildPaginationResult } from '../../../core/utils/pagination';

/**
 * MongoOpportunityRepository — sole place in the opportunity module that imports Mongoose.
 */
export class MongoOpportunityRepository implements IOpportunityRepository {
  async findById(id: string): Promise<OpportunityEntity | null> {
    const doc = await OpportunityModel.findById(id)
      .populate('createdBy', 'name')
      .lean();
    return doc ? this._toEntity(doc) : null;
  }

  async search(params: OpportunitySearchParams): Promise<PaginatedData<OpportunityEntity>> {
    const { filter, sort, useTextSearch, page, limit } = params;
    const { skip } = parsePagination({ page, limit });

    let query = OpportunityModel.find(filter as Parameters<typeof OpportunityModel.find>[0]);
    if (useTextSearch) {
      query = query.select({ score: { $meta: 'textScore' } });
    }

    const [docs, total] = await Promise.all([
      query
        .sort(sort as Parameters<typeof query.sort>[0])
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name')
        .lean(),
      OpportunityModel.countDocuments(filter as Parameters<typeof OpportunityModel.countDocuments>[0]),
    ]);

    return {
      data: docs.map((d) => this._toEntity(d)),
      pagination: buildPaginationResult(page, limit, total),
    };
  }

  async create(data: CreateOpportunityData): Promise<OpportunityEntity> {
    const doc = await OpportunityModel.create(data);
    return this._toEntity(doc.toObject());
  }

  async update(id: string, data: UpdateOpportunityData): Promise<OpportunityEntity | null> {
    const doc = await OpportunityModel.findById(id);
    if (!doc) return null;
    Object.assign(doc, data);
    await doc.save();
    return this._toEntity(doc.toObject());
  }

  async delete(id: string): Promise<boolean> {
    const doc = await OpportunityModel.findById(id);
    if (!doc) return false;
    await doc.deleteOne();
    return true;
  }

  async incrementApplicantsCount(id: string): Promise<void> {
    await OpportunityModel.findByIdAndUpdate(id, { $inc: { applicantsCount: 1 } });
  }

  async findByOwner(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedData<OpportunityEntity>> {
    const { skip } = parsePagination({ page, limit });

    const [docs, total] = await Promise.all([
      OpportunityModel.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OpportunityModel.countDocuments({ createdBy: userId }),
    ]);

    return {
      data: docs.map((d) => this._toEntity(d)),
      pagination: buildPaginationResult(page, limit, total),
    };
  }

  async findActiveWithFilters(
    tags: string[],
    locationRegex?: string,
    limit = 50,
  ): Promise<OpportunityEntity[]> {
    const filter: Record<string, unknown> = { status: 'active' };

    if (tags.length > 0) {
      filter.tags = { $in: tags };
    }

    if (locationRegex) {
      filter.$or = [
        { location: { $regex: locationRegex, $options: 'i' } },
        { isRemote: true },
      ];
    }

    const docs = await OpportunityModel.find(filter).limit(limit).lean();
    return docs.map((d) => this._toEntity(d));
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────
  private _toEntity(doc: Record<string, unknown>): OpportunityEntity {
    return {
      id: String(doc._id),
      title: doc.title as string,
      description: doc.description as string,
      type: doc.type as OpportunityEntity['type'],
      status: doc.status as OpportunityEntity['status'],
      location: doc.location as string,
      isRemote: doc.isRemote as boolean,
      tags: (doc.tags as string[]) ?? [],
      requirements: (doc.requirements as string[]) ?? [],
      salary: doc.salary as OpportunityEntity['salary'],
      deadline: doc.deadline as Date | undefined,
      // createdBy may be a populated object or a plain id string
      createdBy:
        doc.createdBy && typeof doc.createdBy === 'object' && 'name' in (doc.createdBy as object)
          ? (doc.createdBy as { _id: unknown; name: string })
          : String(doc.createdBy),
      applicantsCount: (doc.applicantsCount as number) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    } as OpportunityEntity;
  }
}
