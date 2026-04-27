import { IUserRepository } from './repository/user.repository.interface';
import { UserEntity, PublicUser } from '../../shared/types';
import { AppError } from '../../shared/errors/AppError';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../core/utils/logger';
import { auditLog } from '../../core/utils/audit.logger';
import { z } from 'zod';

export const UpdateProfileDtoSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileDtoSchema>;

const USER_CACHE_TTL = 300;
const userCacheKey = (id: string) => `user:${id}`;
const recommendationCacheKey = (id: string) => `recommendations:${id}`;

export class UserService {
  constructor(private readonly userRepo: IUserRepository) {}

  async getProfile(userId: string): Promise<UserEntity> {
    const cached = await cacheGet<UserEntity>(userCacheKey(userId));
    if (cached) {
      logger.debug(`Cache hit: user ${userId}`);
      return cached;
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw AppError.notFound('User');

    await cacheSet(userCacheKey(userId), user, USER_CACHE_TTL);
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    const user = await this.userRepo.update(userId, dto);
    if (!user) throw AppError.notFound('User');

    // Invalidate recommendation cache when tags or location change
    const cacheKeys = [userCacheKey(userId)];
    if (dto.tags !== undefined || dto.location !== undefined) {
      cacheKeys.push(recommendationCacheKey(userId));
    }
    await Promise.all(cacheKeys.map(cacheDel));

    logger.info(`User profile updated: ${userId}`);
    return user;
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<UserEntity> {
    const user = await this.userRepo.update(userId, { avatarUrl });
    if (!user) throw AppError.notFound('User');

    await cacheDel(userCacheKey(userId));
    return user;
  }

  async getUserById(userId: string): Promise<PublicUser> {
    const user = await this.userRepo.findByIdPublic(userId);
    if (!user) throw AppError.notFound('User');
    return user;
  }

  async deactivateUser(userId: string, requesterId?: string): Promise<void> {
    const ok = await this.userRepo.deactivate(userId);
    if (!ok) throw AppError.notFound('User');

    await cacheDel(userCacheKey(userId));
    auditLog({
      action: 'account.deactivated',
      userId: requesterId,
      targetId: userId,
      targetType: 'user',
    });
  }
}
