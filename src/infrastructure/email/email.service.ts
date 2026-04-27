import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env.schema';
import { logger } from '../../core/utils/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  context?: Record<string, unknown>;
}

// Simple template renderer (no external dep required)
const renderTemplate = (template: string, context: Record<string, unknown>): string => {
  const templates: Record<string, (ctx: Record<string, unknown>) => string> = {
    application_submitted: (ctx) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
        <h2 style="color: #2563eb;">Application Received ✓</h2>
        <p>Your application for <strong>${ctx.opportunityTitle}</strong> has been submitted.</p>
        <p>Application ID: <code>${ctx.applicationId}</code></p>
        <p>We'll notify you when the status changes.</p>
      </div>
    `,
    application_status_updated: (ctx) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
        <h2 style="color: #2563eb;">Application Update</h2>
        <p>Your application for <strong>${ctx.opportunityTitle}</strong> has been updated.</p>
        <p>Status: <strong>${ctx.oldStatus}</strong> → <strong>${ctx.newStatus}</strong></p>
        <p>Application ID: <code>${ctx.applicationId}</code></p>
      </div>
    `,
    welcome: (ctx) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
        <h2>Welcome to Opportunity Platform, ${ctx.name}! 🎉</h2>
        <p>Your account has been created. Start exploring opportunities that match your skills.</p>
      </div>
    `,
  };

  const render = templates[template];
  if (!render) {
    return `<p>Notification: ${template}</p>`;
  }
  return render(context);
};

export class EmailService {
  private transporter: Transporter | null = null;
  private initialized = false;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      if (!env.SMTP_HOST || !env.SMTP_USER) {
        // Fallback: log to console in dev, skip in prod
        logger.warn('Email SMTP not configured — emails will be logged only');
        return null as unknown as Transporter;
      }

      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });

      this.initialized = true;
    }
    return this.transporter;
  }

  async send(options: EmailOptions): Promise<void> {
    try {
      const html = options.html
        ?? (options.template && options.context
          ? renderTemplate(options.template, options.context)
          : undefined);

      const transporter = this.getTransporter();

      if (!transporter) {
        // Dev mode — just log
        logger.info('[Email Skipped - No SMTP]', {
          to: options.to,
          subject: options.subject,
          template: options.template,
        });
        return;
      }

      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html,
        text: options.text,
      });

      logger.info(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      logger.error('Failed to send email:', { to: options.to, subject: options.subject, error });
      // Don't throw — email failures should not crash the app flow
    }
  }

  async verify(): Promise<boolean> {
    try {
      const transporter = this.getTransporter();
      if (!transporter) return false;
      await transporter.verify();
      logger.info('SMTP connection verified');
      return true;
    } catch (error) {
      logger.warn('SMTP verification failed:', error);
      return false;
    }
  }
}
