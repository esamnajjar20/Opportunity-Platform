import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import mongoose from 'mongoose';
import { Router } from 'express';

import { env } from './config/env.schema';
import { swaggerSpec } from './config/swagger';
import { getRedisClient } from './config/redis';
import { globalRateLimiter } from './core/middleware/rateLimit.middleware';
import { errorMiddleware, notFoundMiddleware } from './core/middleware/error.middleware';
import { correlationIdMiddleware } from './core/middleware/correlationId.middleware';
import { authenticate, authorize } from './core/middleware/auth.middleware';
import { logger } from './core/utils/logger';

import { createAuthRouter } from './modules/auth/auth.routes';
import { createUserRouter } from './modules/user/user.routes';
import { createOpportunityRouter } from './modules/opportunity/opportunity.routes';
import { createApplicationRouter } from './modules/application/application.routes';

import { NotificationController } from './modules/notification/notification.controller';
import { RecommendationController } from './modules/recommendation/recommendation.controller';
import { queueService } from './infrastructure/queue/queue.service';
import { AppContainer } from './config/container';

export const createApp = (container: AppContainer): Application => {
  const app = express();

  // ─── Correlation ID (must be first) ──────────────────────────────────────
  app.use(correlationIdMiddleware);

  // Trust proxy for correct IP behind nginx/ALB
  app.set('trust proxy', 1);

  // ─── Security headers ─────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          connectSrc: ["'self'", env.CLIENT_URL],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          ...(env.NODE_ENV === 'production' && { upgradeInsecureRequests: [] }),
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    }),
  );

  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id'],
      exposedHeaders: ['x-request-id'],
    }),
  );

  // ─── HTTP access logging ──────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    morgan.token('request-id', (req) => (req as Request).headers['x-request-id'] as string ?? '-');
    app.use(
      morgan(':method :url :status :res[content-length] - :response-time ms [:request-id]', {
        stream: { write: (message) => logger.http(message.trim()) },
        skip: (req) => req.path === '/health',
      }),
    );
  }

  // ─── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '50kb' }));

  // ─── Rate limiting ────────────────────────────────────────────────────────
  app.use(globalRateLimiter);

  // ─── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const mongoState = mongoose.connection.readyState;
      if (mongoState !== 1) throw new Error(`MongoDB not ready (state: ${mongoState})`);
      await getRedisClient().ping();
      res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({
        status: 'degraded',
        error: err instanceof Error ? err.message : 'Dependency check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── Swagger docs (non-production only) ───────────────────────────────────
  if (env.NODE_ENV !== 'production') {
    app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Opportunity Platform API',
      swaggerOptions: { persistAuthorization: true },
    }));
  }

  // ─── Module routes (injected from container) ──────────────────────────────
  app.use('/api/v1/auth',         createAuthRouter(container.authService));
  app.use('/api/v1/users',        createUserRouter(container.userService));
  app.use('/api/v1/opportunities', createOpportunityRouter(container.opportunityService));
  app.use('/api/v1/applications', createApplicationRouter(container.applicationService));

  // Notification routes
  const notifController = new NotificationController(container.notificationService);
  const notifRouter = Router();
  notifRouter.use(authenticate);
  notifRouter.get('/',            notifController.getMyNotifications);
  notifRouter.patch('/read-all',  notifController.markAllAsRead);
  notifRouter.patch('/:id/read',  notifController.markAsRead);
  app.use('/api/v1/notifications', notifRouter);

  // Recommendation routes
  const recController = new RecommendationController(container.recommendationService);
  const recRouter = Router();
  recRouter.get('/',       authenticate, recController.getMyRecommendations);
  recRouter.get('/explore', recController.explore);
  app.use('/api/v1/recommendations', recRouter);

  // Admin routes
  app.get('/api/v1/admin/queue-stats', authenticate, authorize('admin'), async (_req, res) => {
    const stats = await queueService.getQueueStats();
    res.json({ success: true, data: stats });
  });

  // ─── 404 + Error handling ─────────────────────────────────────────────────
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
