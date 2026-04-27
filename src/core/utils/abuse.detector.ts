import { getRedisClient } from '../../config/redis';
import { logger } from './logger';
import { auditLog } from './audit.logger';

// ---------------------------------------------------------------------------
// Abuse detection: stateless counters in Redis, no blocking logic.
// Logging only at this stage — blocking requires threshold tuning in production.
// Call sites are fire-and-forget (.catch(() => {})) so a Redis hiccup
// never affects the main request path.
// ---------------------------------------------------------------------------

const WINDOWS = {
  LOGIN_FAILURE: { key: 'abuse:login_fail', ttl: 15 * 60, threshold: 5 },
  APP_SUBMISSION: { key: 'abuse:app_submit', ttl: 60 * 60, threshold: 10 },
} as const;

/**
 * Increment a counter and emit an audit log if the threshold is crossed.
 * Returns the current hit count (useful for tests).
 */
async function checkAndFlag(
  namespace: string,
  identifier: string,    // userId or IP
  ttl: number,           // window in seconds
  threshold: number,
  action: Parameters<typeof auditLog>[0]['action'],
  meta: Record<string, unknown> = {},
): Promise<number> {
  const client = getRedisClient();
  const key = `${namespace}:${identifier}`;

  const pipeline = client.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttl, 'NX'); // only set TTL on first hit
  const results = await pipeline.exec();
  const count = (results?.[0]?.[1] as number) ?? 1;

  if (count === threshold) {
    // Log only at the threshold crossing — not every subsequent hit
    logger.warn(`[AbuseDetector] Threshold reached: ${namespace}`, {
      identifier,
      count,
      ...meta,
    });
    auditLog({ action, meta: { identifier, count, ...meta } });
  }

  return count;
}

/**
 * Track failed login attempts per IP.
 * Fires when the same IP fails 5 times within 15 minutes.
 */
export const trackLoginFailure = (ip: string): void => {
  checkAndFlag(
    WINDOWS.LOGIN_FAILURE.key,
    ip,
    WINDOWS.LOGIN_FAILURE.ttl,
    WINDOWS.LOGIN_FAILURE.threshold,
    'abuse.repeated_login_failure',
    { ip },
  ).catch(() => {});
};

/**
 * Track application submissions per user.
 * Fires when the same userId submits 10+ applications within 1 hour.
 */
export const trackApplicationSubmission = (userId: string): void => {
  checkAndFlag(
    WINDOWS.APP_SUBMISSION.key,
    userId,
    WINDOWS.APP_SUBMISSION.ttl,
    WINDOWS.APP_SUBMISSION.threshold,
    'abuse.excessive_applications',
    { userId },
  ).catch(() => {});
};
