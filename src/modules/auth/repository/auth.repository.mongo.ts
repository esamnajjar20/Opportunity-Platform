import { RefreshTokenModel } from '../auth.model';
import { IAuthRepository, CreateRefreshTokenData } from './auth.repository.interface';
import { RefreshTokenEntity } from '../../../shared/types';

/**
 * MongoAuthRepository — sole place in the auth module that imports Mongoose.
 */
export class MongoAuthRepository implements IAuthRepository {
  async createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshTokenEntity> {
    const doc = await RefreshTokenModel.create({
      tokenHash: data.tokenHash,
      userId: data.userId,
      expiresAt: data.expiresAt,
    });
    return this._toEntity((doc.toObject() as unknown) as Record<string, unknown>);
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenEntity | null> {
    const doc = await RefreshTokenModel.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).lean();
    return doc ? this._toEntity(doc) : null;
  }

  async deleteRefreshToken(tokenHash: string): Promise<boolean> {
    const result = await RefreshTokenModel.deleteOne({ tokenHash });
    return result.deletedCount > 0;
  }

  async deleteAllRefreshTokensForUser(userId: string): Promise<number> {
    const result = await RefreshTokenModel.deleteMany({ userId });
    return result.deletedCount;
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────
  private _toEntity(doc: Record<string, unknown>): RefreshTokenEntity {
    return {
      id: String(doc._id),
      tokenHash: doc.tokenHash as string,
      userId: String(doc.userId),
      expiresAt: doc.expiresAt as Date,
      createdAt: doc.createdAt as Date,
    };
  }
}
