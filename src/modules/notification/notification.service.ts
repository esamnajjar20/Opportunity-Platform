import { INotificationRepository } from './repository/notification.repository.interface';
import { EmailService } from '../../infrastructure/email/email.service';
import { SocketService } from '../../infrastructure/socket/socket.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { logger } from '../../core/utils/logger';
import { NotificationEntity, NotificationType } from '../../shared/types';

export { NotificationType, NotificationEntity };

export class NotificationService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly emailService: EmailService,
    private readonly socketService: SocketService,
    private readonly queueService: QueueService,
  ) {}

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    meta?: Record<string, unknown>,
  ): Promise<NotificationEntity> {
    const notification = await this.notificationRepo.create({ userId, type, title, body, meta });

    this.socketService.emitToUser(userId, 'notification:new', {
      id: notification.id,
      type,
      title,
      body,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  async onApplicationSubmitted(payload: {
    applicationId: string;
    opportunityId: string;
    applicantId: string;
    applicantEmail: string;
    opportunityTitle: string;
  }): Promise<void> {
    try {
      await this.createNotification(
        payload.applicantId,
        'application_submitted',
        'Application Submitted',
        `Your application for "${payload.opportunityTitle}" has been submitted successfully.`,
        { applicationId: payload.applicationId, opportunityId: payload.opportunityId },
      );

      await this.queueService.addEmailJob({
        to: payload.applicantEmail,
        subject: `Application Received — ${payload.opportunityTitle}`,
        template: 'application_submitted',
        context: { opportunityTitle: payload.opportunityTitle, applicationId: payload.applicationId },
      });

      logger.info(`Notifications sent for application ${payload.applicationId}`);
    } catch (error) {
      logger.error('Failed to send application submitted notifications:', error);
    }
  }

  async onApplicationStatusUpdated(payload: {
    applicationId: string;
    opportunityId: string;
    applicantId: string;
    applicantEmail: string;
    opportunityTitle: string;
    oldStatus: string;
    newStatus: string;
  }): Promise<void> {
    try {
      const notificationType: NotificationType =
        payload.newStatus === 'accepted'
          ? 'application_accepted'
          : payload.newStatus === 'rejected'
          ? 'application_rejected'
          : 'application_reviewing';

      const title =
        payload.newStatus === 'accepted'
          ? '🎉 Application Accepted!'
          : payload.newStatus === 'rejected'
          ? 'Application Update'
          : 'Application Under Review';

      const body = `Your application for "${payload.opportunityTitle}" is now ${payload.newStatus}.`;

      await this.createNotification(payload.applicantId, notificationType, title, body, {
        applicationId: payload.applicationId,
        opportunityId: payload.opportunityId,
        newStatus: payload.newStatus,
      });

      await this.queueService.addEmailJob({
        to: payload.applicantEmail,
        subject: `${title} — ${payload.opportunityTitle}`,
        template: 'application_status_updated',
        context: {
          opportunityTitle: payload.opportunityTitle,
          applicationId: payload.applicationId,
          newStatus: payload.newStatus,
          oldStatus: payload.oldStatus,
        },
      });
    } catch (error) {
      logger.error('Failed to send status update notifications:', error);
    }
  }

  async getMyNotifications(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: NotificationEntity[]; unreadCount: number }> {
    return this.notificationRepo.findByUser(userId, page, limit);
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepo.markAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.markAllAsRead(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.countUnread(userId);
  }
}
