import { eventBus } from '../../core/events/event.bus';
import { NotificationService } from './notification.service';
import { logger } from '../../core/utils/logger';

export const registerNotificationEventHandlers = (
  notificationService: NotificationService,
): void => {
  eventBus.on('application:submitted', async (payload) => {
    logger.debug('[NotificationEvent] application:submitted', payload);
    await notificationService.onApplicationSubmitted(payload);
  });

  eventBus.on('application:status:updated', async (payload) => {
    logger.debug('[NotificationEvent] application:status:updated', payload);
    await notificationService.onApplicationStatusUpdated(payload);
  });
};
