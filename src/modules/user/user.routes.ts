import { Router } from 'express';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { authenticate, authorize } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validation.middleware';
import { UpdateProfileDtoSchema } from './user.service';

export function createUserRouter(userService: UserService): Router {
  const router = Router();
  const userController = new UserController(userService);

  router.use(authenticate);
  router.get('/me',    userController.getMyProfile);
  router.patch('/me',  validateBody(UpdateProfileDtoSchema), userController.updateMyProfile);
  router.get('/:id',   userController.getUserById);
  router.delete('/:id', authorize('admin'), userController.deactivateUser);

  return router;
}
