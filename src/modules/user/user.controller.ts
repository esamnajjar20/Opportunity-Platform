import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { ResponseUtil } from '../../core/utils/response';

export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * @swagger
   * /users/me:
   *   get:
   *     tags: [Users]
   *     summary: Get current user profile
   *     responses:
   *       200: { description: User profile }
   */
  getMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.getProfile(req.user!.userId);
      ResponseUtil.success(res, user);
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /users/me:
   *   patch:
   *     tags: [Users]
   *     summary: Update current user profile
   */
  updateMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.updateProfile(req.user!.userId, req.body);
      ResponseUtil.success(res, user, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * @swagger
   * /users/{id}:
   *   get:
   *     tags: [Users]
   *     summary: Get user by ID
   */
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.userService.getUserById(req.params.id);
      ResponseUtil.success(res, user);
    } catch (error) {
      next(error);
    }
  };

  deactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.userService.deactivateUser(req.params.id, req.user!.userId);
      ResponseUtil.success(res, null, 'User deactivated');
    } catch (error) {
      next(error);
    }
  };
}
