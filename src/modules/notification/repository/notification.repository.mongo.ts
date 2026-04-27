import { NotificationModel } from '../notification.model';
import { INotificationRepository, CreateNotificationData } from './notification.repository.interface';
import { NotificationEntity } from '../../../shared/types';

/**
 * MongoNotificationRepository — sole place in the notification module that imports Mongoose.
 */
export class MongoNotificationRepository implements INotificationRepository {
  async create(data: CreateNotificationData): Promise<NotificationEntity> {
    const doc = await NotificationModel.create(data);
    return this._toEntity(doc.toObject());
  }

  async findByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: NotificationEntity[]; unreadCount: number }> {
    const skip = (page - 1) * limit;

    const [docs, unreadCount] = await Promise.all([
      NotificationModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments({ userId, isRead: false }),
    ]);

    return {
      data: docs.map((d) => this._toEntity(d)),
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await NotificationModel.updateOne(
      { _id: notificationId, userId },
      { isRead: true },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await NotificationModel.updateMany({ userId, isRead: false }, { isRead: true });
  }

  async countUnread(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ userId, isRead: false });
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────
  private _toEntity(doc: Record<string, unknown>): NotificationEntity {
    return {
      id: String(doc._id),
      userId: String(doc.userId),
      type: doc.type as NotificationEntity['type'],
      title: doc.title as string,
      body: doc.body as string,
      isRead: doc.isRead as boolean,
      meta: doc.meta as Record<string, unknown> | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
