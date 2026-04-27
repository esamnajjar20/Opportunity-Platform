import { Router } from 'express';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import { authenticate, authorize, optionalAuthenticate } from '../../core/middleware/auth.middleware';
import { validateBody, validateQuery } from '../../core/middleware/validation.middleware';
import { CreateOpportunityDtoSchema, UpdateOpportunityDtoSchema } from './opportunity.service';
import { SearchOpportunityDtoSchema } from './opportunity.search';
import { searchRateLimiter, mutationRateLimiter } from '../../core/middleware/rateLimit.middleware';

export function createOpportunityRouter(opportunityService: OpportunityService): Router {
  const router = Router();
  const opportunityController = new OpportunityController(opportunityService);

  // Static paths first
  router.get('/',    optionalAuthenticate, searchRateLimiter, validateQuery(SearchOpportunityDtoSchema), opportunityController.search);
  router.post('/',   authenticate, authorize('recruiter', 'admin'), mutationRateLimiter, validateBody(CreateOpportunityDtoSchema), opportunityController.create);
  router.get('/my',  authenticate, opportunityController.getMyOpportunities);

  // Parameterised paths last
  router.get('/:id',    optionalAuthenticate, opportunityController.findById);
  router.patch('/:id',  authenticate, authorize('recruiter', 'admin'), mutationRateLimiter, validateBody(UpdateOpportunityDtoSchema), opportunityController.update);
  router.delete('/:id', authenticate, mutationRateLimiter, opportunityController.delete);

  return router;
}
