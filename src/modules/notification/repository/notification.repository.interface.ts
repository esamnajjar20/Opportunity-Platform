import { NotificationEntity, NotificationType } from '../../../shared/types';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}

/**
 * INotificationRepository — all persistence for the Notification domain.
 */
export interface INotificationRepository {
  create(data: CreateNotificationData): Promise<NotificationEntity>;

  findByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: NotificationEntity[]; unreadCount: number }>;

  markAsRead(notificationId: string, userId: string): Promise<void>;

  markAllAsRead(userId: string): Promise<void>;

  countUnread(userId: string): Promise<number>;
}
