import { Job } from 'bull';
import { queueService, EmailJobData } from '../infrastructure/queue/queue.service';
import { EmailService } from '../infrastructure/email/email.service';
import { logger } from '../core/utils/logger';

const emailService = new EmailService();

export const startNotificationWorker = (): void => {
  const emailQueue = queueService.getEmailQueue();

  emailQueue.process(5, async (job: Job<EmailJobData>) => {
    logger.info(`[Worker] Processing email job ${job.id}`, { to: job.data.to });

    await emailService.send({
      to: job.data.to,
      subject: job.data.subject,
      template: job.data.template,
      context: job.data.context,
      html: job.data.html,
    });

    logger.info(`[Worker] Email job ${job.id} done`);
  });

  logger.info('Notification worker started (concurrency: 5)');
};
