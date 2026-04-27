import 'dotenv/config';
import http from 'http';

import { env } from './config/env.schema';
import { connectDB, disconnectDB } from './config/db';
import { getRedisClient, disconnectRedis } from './config/redis';
import { initCloudinary } from './config/cloudinary';
import { createContainer } from './config/container';
import { createApp } from './app';
import { socketService } from './infrastructure/socket/socket.service';
import { startNotificationWorker } from './workers/notification.worker';
import { logger } from './core/utils/logger';
import { queueService } from './infrastructure/queue/queue.service';

import { registerAuthEventHandlers } from './modules/auth/auth.events';
import { registerOpportunityEventHandlers } from './modules/opportunity/opportunity.events';
import { registerNotificationEventHandlers } from './modules/notification/notification.events';

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const createShutdownHandler = (
  server: http.Server,
  signal: string,
): (() => Promise<void>) => {
  return async () => {
    logger.info(`[Shutdown] Received ${signal} — starting graceful shutdown`);

    const hardKill = setTimeout(() => {
      logger.error('[Shutdown] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('[Shutdown] HTTP server closed');

      await queueService.close();
      logger.info('[Shutdown] Bull queues closed');

      await disconnectDB();
      logger.info('[Shutdown] MongoDB disconnected');

      await disconnectRedis();
      logger.info('[Shutdown] Redis disconnected');

      clearTimeout(hardKill);
      logger.info('[Shutdown] Clean exit');
      process.exit(0);
    } catch (err) {
      logger.error('[Shutdown] Error during shutdown:', err);
      process.exit(1);
    }
  };
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const bootstrap = async (): Promise<void> => {
  try {
    // Infrastructure
    await connectDB();
    getRedisClient();
    initCloudinary();

    // Build the full object graph — repos injected into services here
    const container = createContainer();

    // Event handlers receive the SAME service instances from the container
    registerAuthEventHandlers();
    registerOpportunityEventHandlers();
    registerNotificationEventHandlers(container.notificationService);

    // Express app — receives container so no service is instantiated twice
    const app = createApp(container);
    const server = http.createServer(app);

    // Socket.io (initialised after server creation)
    socketService.initialize(server);

    // Background workers
    if (env.NODE_ENV !== 'test') {
      startNotificationWorker();
    }

    server.listen(env.PORT, () => {
      logger.info(
        `\n╔════════════════════════════════════════╗` +
        `\n║   Opportunity Platform API             ║` +
        `\n╠════════════════════════════════════════╣` +
        `\n║  Port : ${env.PORT}` +
        `\n║  Mode : ${env.NODE_ENV}` +
        `\n║  Docs : http://localhost:${env.PORT}/api/v1/docs` +
        `\n╚════════════════════════════════════════╝`,
      );
    });

    process.once('SIGTERM', createShutdownHandler(server, 'SIGTERM'));
    process.once('SIGINT',  createShutdownHandler(server, 'SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('[Process] Unhandled Promise Rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('[Process] Uncaught Exception — exiting:', error);
      createShutdownHandler(server, 'uncaughtException')();
    });
  } catch (error) {
    logger.error('[Bootstrap] Failed to start:', error);
    process.exit(1);
  }
};

bootstrap();
