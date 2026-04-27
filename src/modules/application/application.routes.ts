import { Router } from 'express';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { authenticate, authorize } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validation.middleware';
import { mutationRateLimiter } from '../../core/middleware/rateLimit.middleware';
import { ApplyDtoSchema, UpdateStatusDtoSchema } from './application.service';

export function createApplicationRouter(applicationService: ApplicationService): Router {
  const router = Router();
  const applicationController = new ApplicationController(applicationService);

  router.use(authenticate);

  // Static paths first
  router.post('/',                      mutationRateLimiter, validateBody(ApplyDtoSchema), applicationController.apply);
  router.get('/me',                     applicationController.getMyApplications);
  router.get('/opportunity/:opportunityId', authorize('recruiter', 'admin'), applicationController.getOpportunityApplications);

  // Parameterised paths last
  router.get('/:id',            applicationController.getById);
  router.patch('/:id/status',   mutationRateLimiter, validateBody(UpdateStatusDtoSchema), applicationController.updateStatus);

  return router;
}
