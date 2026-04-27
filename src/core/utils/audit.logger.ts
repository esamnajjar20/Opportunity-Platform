import { logger } from './logger';
import { getRequestId } from '../middleware/correlationId.middleware';

// ─── Audit event types ────────────────────────────────────────────────────────
// Strictly typed — adding a new event requires updating this union
export type AuditAction =
  // Auth
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.token.refresh'
  | 'auth.token.revoked'
  // Account
  | 'account.deactivated'
  | 'account.role_changed'
  // Application
  | 'application.submitted'
  | 'application.status_changed'
  // Abuse
  | 'abuse.repeated_login_failure'
  | 'abuse.excessive_applications';

export interface AuditEntry {
  action: AuditAction;
  userId?: string;        // who performed the action (never email)
  targetId?: string;      // affected resource ID
  targetType?: string;    // 'user' | 'application' | 'opportunity'
  meta?: Record<string, unknown>; // extra context — NO passwords, NO tokens, NO emails
  ip?: string;
  userAgent?: string;
}

/**
 * Emit a structured audit log entry.
 * All entries are JSON, include requestId for correlation, and NEVER contain PII.
 *
 * Rule: userId = opaque ID only. No names, no emails, no tokens.
 */
export const auditLog = (entry: AuditEntry): void => {
  logger.info('[AUDIT]', {
    audit: true,
    requestId: getRequestId(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
};
