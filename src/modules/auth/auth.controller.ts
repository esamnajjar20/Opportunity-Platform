import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { ResponseUtil } from '../../core/utils/response';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      ResponseUtil.created(res, result, 'Registration successful');
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login({ ...req.body, ip: req.ip });
      ResponseUtil.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        next(new Error('refreshToken is required'));
        return;
      }
      const tokens = await this.authService.refreshTokens(refreshToken);
      ResponseUtil.success(res, tokens, 'Tokens refreshed');
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      // Extract current access token from header for immediate blacklisting
      const accessToken = req.headers.authorization?.split(' ')[1];
      if (refreshToken) {
        await this.authService.logout({ refreshToken, accessToken });
      }
      ResponseUtil.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accessToken = req.headers.authorization?.split(' ')[1];
      await this.authService.logoutAll(req.user!.userId, accessToken);
      ResponseUtil.success(res, null, 'Logged out from all devices');
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ResponseUtil.success(res, req.user, 'Current user');
    } catch (error) {
      next(error);
    }
  };
}
