import Bull, { Queue, Job } from 'bull';
import { env } from '../../config/env.schema';
import { logger } from '../../core/utils/logger';

export interface EmailJobData {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, unknown>;
  html?: string;
}

const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
};

export class QueueService {
  // Only the email queue is used — the notification queue was defined but
  // never had a processor registered and addNotificationJob was never called.
  // Removed to prevent silent job accumulation in Redis.
  private emailQueue: Queue<EmailJobData>;

  constructor() {
    this.emailQueue = new Bull<EmailJobData>('email', { redis: redisConfig });
    this._setupEventHandlers(this.emailQueue, 'email');
  }

  async addEmailJob(data: EmailJobData, opts?: Bull.JobOptions): Promise<Job<EmailJobData>> {
    return this.emailQueue.add(data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
      ...opts,
    });
  }

  getEmailQueue(): Queue<EmailJobData> {
    return this.emailQueue;
  }

  async getQueueStats(): Promise<{
    email: { waiting: number; active: number; completed: number; failed: number };
  }> {
    return { email: await this.emailQueue.getJobCounts() };
  }

  async close(): Promise<void> {
    await this.emailQueue.close();
  }

  private _setupEventHandlers(queue: Queue, name: string): void {
    queue.on('completed', (job) => {
      logger.debug(`[Queue:${name}] Job ${job.id} completed`);
    });
    queue.on('failed', (job, error) => {
      logger.error(`[Queue:${name}] Job ${job.id} failed:`, {
        error: error.message,
        data: job.data,
      });
    });
    queue.on('stalled', (job) => {
      logger.warn(`[Queue:${name}] Job ${job.id} stalled`);
    });
    queue.on('error', (error) => {
      logger.error(`[Queue:${name}] Queue error:`, error);
    });
  }
}

// Singleton
export const queueService = new QueueService();
