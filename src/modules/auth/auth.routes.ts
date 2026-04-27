import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { validateBody } from '../../core/middleware/validation.middleware';
import { authenticate } from '../../core/middleware/auth.middleware';
import { authRateLimiter } from '../../core/middleware/rateLimit.middleware';
import { RegisterDtoSchema, LoginDtoSchema } from './auth.service';

const RefreshDtoSchema = z.object({ refreshToken: z.string().min(1) });
const LogoutDtoSchema = z.object({ refreshToken: z.string().min(1).optional() });

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const authController = new AuthController(authService);

  router.post('/register',    authRateLimiter, validateBody(RegisterDtoSchema),  authController.register);
  router.post('/login',       authRateLimiter, validateBody(LoginDtoSchema),      authController.login);
  router.post('/refresh',     authRateLimiter, validateBody(RefreshDtoSchema),    authController.refresh);
  router.post('/logout',      authRateLimiter, validateBody(LogoutDtoSchema),     authController.logout);
  router.post('/logout-all',  authenticate,                                        authController.logoutAll);
  router.get('/me',           authenticate,                                        authController.me);

  return router;
}
