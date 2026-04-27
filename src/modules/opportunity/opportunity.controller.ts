import { Request, Response, NextFunction } from 'express';
import { OpportunityService } from './opportunity.service';
import { ResponseUtil } from '../../core/utils/response';

export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  /**
   * @swagger
   * /opportunities:
   *   post:
   *     tags: [Opportunities]
   *     summary: Create a new opportunity
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const opportunity = await this.opportunityService.create(req.body, req.user!.userId);
      ResponseUtil.created(res, opportunity, 'Opportunity created');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /opportunities:
   *   get:
   *     tags: [Opportunities]
   *     summary: Search and list opportunities
   *     security: []
   */
  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.opportunityService.search(req.query as never);
      ResponseUtil.paginated(res, result.data, result.pagination);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /opportunities/{id}:
   *   get:
   *     tags: [Opportunities]
   *     summary: Get opportunity by ID
   *     security: []
   */
  findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const opportunity = await this.opportunityService.findById(req.params.id);
      ResponseUtil.success(res, opportunity);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /opportunities/{id}:
   *   patch:
   *     tags: [Opportunities]
   *     summary: Update an opportunity
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const opportunity = await this.opportunityService.update(
        req.params.id,
        req.body,
        req.user!.userId,
        req.user!.role,
      );
      ResponseUtil.success(res, opportunity, 'Opportunity updated');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /opportunities/{id}:
   *   delete:
   *     tags: [Opportunities]
   *     summary: Delete an opportunity
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.opportunityService.delete(req.params.id, req.user!.userId, req.user!.role);
      ResponseUtil.noContent(res);
    } catch (error) {
      next(error);
    }
  };

  getMyOpportunities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = req.query;
      const result = await this.opportunityService.getMyOpportunities(
        req.user!.userId,
        Number(page) || 1,
        Number(limit) || 10,
      );
      ResponseUtil.paginated(res, result.data, result.pagination);
    } catch (error) {
      next(error);
    }
  };
}
