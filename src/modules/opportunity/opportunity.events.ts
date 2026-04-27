import { eventBus } from '../../core/events/event.bus';
import { logger } from '../../core/utils/logger';

export const registerOpportunityEventHandlers = (): void => {
  eventBus.on('opportunity:created', async (payload) => {
    logger.info(`[OpportunityEvent] Created: "${payload.title}" by ${payload.createdBy}`, {
      opportunityId: payload.opportunityId,
      tags: payload.tags,
    });
    // Here you could queue recommendation index updates, notifications to matching users, etc.
  });

  eventBus.on('opportunity:updated', async (payload) => {
    logger.info(`[OpportunityEvent] Updated: ${payload.opportunityId}`, {
      changes: payload.changes,
    });
  });
};
