import { eventBus } from '../../core/events/event.bus';
import { logger } from '../../core/utils/logger';

export const registerAuthEventHandlers = (): void => {
  eventBus.on('user:registered', async (payload) => {
    logger.info(`[AuthEvent] New user registered`, { userId: payload.userId });
    // Welcome email could be queued here via queueService.addEmailJob(...)
  });
};
