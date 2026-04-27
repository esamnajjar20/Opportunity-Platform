/**
 * Composition Root — the ONLY place that wires concrete Mongoose repositories
 * to service interfaces. Everything outside this file depends on interfaces.
 *
 * This is NOT a DI framework. It is a plain factory function that creates the
 * object graph once at startup and passes instances down the tree.
 */

import { MongoUserRepository } from '../modules/user/repository/user.repository.mongo';
import { MongoAuthRepository } from '../modules/auth/repository/auth.repository.mongo';
import { MongoOpportunityRepository } from '../modules/opportunity/repository/opportunity.repository.mongo';
import { MongoApplicationRepository } from '../modules/application/repository/application.repository.mongo';
import { MongoNotificationRepository } from '../modules/notification/repository/notification.repository.mongo';

import { AuthService } from '../modules/auth/auth.service';
import { UserService } from '../modules/user/user.service';
import { OpportunityService } from '../modules/opportunity/opportunity.service';
import { ApplicationService } from '../modules/application/application.service';
import { NotificationService } from '../modules/notification/notification.service';
import { RecommendationService } from '../modules/recommendation/recommendation.service';

import { EmailService } from '../infrastructure/email/email.service';
import { socketService } from '../infrastructure/socket/socket.service';
import { queueService } from '../infrastructure/queue/queue.service';

export interface AppContainer {
  // Repositories
  userRepo: MongoUserRepository;
  authRepo: MongoAuthRepository;
  opportunityRepo: MongoOpportunityRepository;
  applicationRepo: MongoApplicationRepository;
  notificationRepo: MongoNotificationRepository;

  // Services
  authService: AuthService;
  userService: UserService;
  opportunityService: OpportunityService;
  applicationService: ApplicationService;
  notificationService: NotificationService;
  recommendationService: RecommendationService;
}

export function createContainer(): AppContainer {
  // ── Repositories (Mongoose layer) ──────────────────────────────────────────
  const userRepo = new MongoUserRepository();
  const authRepo = new MongoAuthRepository();
  const opportunityRepo = new MongoOpportunityRepository();
  const applicationRepo = new MongoApplicationRepository();
  const notificationRepo = new MongoNotificationRepository();

  // ── Infrastructure ─────────────────────────────────────────────────────────
  const emailService = new EmailService();

  // ── Services (depend only on interfaces) ───────────────────────────────────
  const authService = new AuthService(userRepo, authRepo);
  const userService = new UserService(userRepo);
  const opportunityService = new OpportunityService(opportunityRepo);
  const applicationService = new ApplicationService(applicationRepo, opportunityRepo, userRepo);
  const notificationService = new NotificationService(
    notificationRepo,
    emailService,
    socketService,
    queueService,
  );
  const recommendationService = new RecommendationService(opportunityRepo, userRepo);

  return {
    userRepo,
    authRepo,
    opportunityRepo,
    applicationRepo,
    notificationRepo,
    authService,
    userService,
    opportunityService,
    applicationService,
    notificationService,
    recommendationService,
  };
}
