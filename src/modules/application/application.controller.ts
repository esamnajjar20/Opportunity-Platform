import { Request, Response, NextFunction } from 'express';
import { ApplicationService } from './application.service';
import { ResponseUtil } from '../../core/utils/response';

export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  /**
   * @swagger
   * /applications:
   *   post:
   *     tags: [Applications]
   *     summary: Apply to an opportunity
   */
  apply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const application = await this.applicationService.apply(req.body, req.user!.userId);
      ResponseUtil.created(res, application, 'Application submitted successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /applications/me:
   *   get:
   *     tags: [Applications]
   *     summary: Get my applications
   */
  getMyApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = req.query;
      const result = await this.applicationService.getMyApplications(
        req.user!.userId,
        Number(page) || 1,
        Number(limit) || 10,
      );
      ResponseUtil.paginated(res, result.data, result.pagination);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /applications/{id}:
   *   get:
   *     tags: [Applications]
   *     summary: Get application by ID
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const application = await this.applicationService.getById(
        req.params.id,
        req.user!.userId,
        req.user!.role,
      );
      ResponseUtil.success(res, application);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /applications/{id}/status:
   *   patch:
   *     tags: [Applications]
   *     summary: Update application status
   */
  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const application = await this.applicationService.updateStatus(
        req.params.id,
        req.body,
        req.user!.userId,
        req.user!.role,
      );
      ResponseUtil.success(res, application, 'Status updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /applications/opportunity/{opportunityId}:
   *   get:
   *     tags: [Applications]
   *     summary: Get all applications for an opportunity (recruiter only)
   */
  getOpportunityApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = req.query;
      const result = await this.applicationService.getOpportunityApplications(
        req.params.opportunityId,
        req.user!.userId,
        req.user!.role,
        Number(page) || 1,
        Number(limit) || 10,
      );
      ResponseUtil.paginated(res, result.data, result.pagination);
    } catch (error) {
      next(error);
    }
  };
}
