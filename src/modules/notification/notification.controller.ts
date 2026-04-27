import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';
import { ResponseUtil } from '../../core/utils/response';

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * @swagger
   * /notifications:
   *   get:
   *     tags: [Notifications]
   *     summary: Get my notifications
   */
  getMyNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = req.query;
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20)); // cap at 100
      const result = await this.notificationService.getMyNotifications(
        req.user!.userId,
        safePage,
        safeLimit,
      );
      ResponseUtil.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /notifications/{id}/read:
   *   patch:
   *     tags: [Notifications]
   *     summary: Mark notification as read
   */
  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.notificationService.markAsRead(req.params.id, req.user!.userId);
      ResponseUtil.success(res, null, 'Marked as read');
    } catch (error) {
      next(error);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.notificationService.markAllAsRead(req.user!.userId);
      ResponseUtil.success(res, null, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  };
}
