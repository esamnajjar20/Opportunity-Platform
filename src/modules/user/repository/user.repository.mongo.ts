import { UserModel } from '../user.model';
import { IUserRepository, CreateUserData, UpdateUserData } from './user.repository.interface';
import { UserEntity, PublicUser } from '../../../shared/types';

/**
 * MongoUserRepository — sole place in the user module that imports Mongoose.
 * Converts Mongoose Documents to plain UserEntity objects before returning.
 */
export class MongoUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const doc = await UserModel.findById(id).lean();
    return doc ? this._toEntity(doc) : null;
  }

  async findByIdPublic(id: string): Promise<PublicUser | null> {
    const doc = await UserModel.findById(id).select('-password').lean();
    if (!doc) return null;
    const entity = this._toEntity(doc);
    const { password: _, ...pub } = entity;
    return pub as PublicUser;
  }

  async findByEmail(email: string, includePassword = false): Promise<UserEntity | null> {
    const query = UserModel.findOne({ email: email.toLowerCase() });
    if (includePassword) query.select('+password');
    const doc = await query.lean();
    return doc ? this._toEntity(doc) : null;
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const doc = await UserModel.create({
      name: data.name,
      email: data.email.toLowerCase(),
      password: data.password,
      role: data.role ?? 'user',
    });
    return this._toEntity(doc.toObject());
  }

  async update(id: string, data: UpdateUserData): Promise<UserEntity | null> {
    const doc = await UserModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    ).lean();
    return doc ? this._toEntity(doc) : null;
  }

  async deactivate(id: string): Promise<boolean> {
    const result = await UserModel.findByIdAndUpdate(id, { isActive: false });
    return !!result;
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────
  private _toEntity(doc: Record<string, unknown>): UserEntity {
    return {
      id: String(doc._id),
      name: doc.name as string,
      email: doc.email as string,
      password: (doc.password as string) ?? '',
      role: doc.role as UserEntity['role'],
      bio: doc.bio as string | undefined,
      location: doc.location as string | undefined,
      tags: (doc.tags as string[]) ?? [],
      avatarUrl: doc.avatarUrl as string | undefined,
      isActive: doc.isActive as boolean,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
