import rateLimit, { Options } from 'express-rate-limit';
import { Request } from 'express';
import { env } from '../../config/env.schema';
import { AppError } from '../../shared/errors/AppError';
import { getRedisClient } from '../../config/redis';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Redis-backed store — shared across all instances in a horizontally-scaled
// deployment. Reuses the existing ioredis connection pool.
// ---------------------------------------------------------------------------
class RedisRateLimitStore {
  constructor(
    private readonly prefix: string,
    private readonly windowMs: number,
  ) {}

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const client = getRedisClient();
    const redisKey = `${this.prefix}:${key}`;
    const ttlSeconds = Math.ceil(this.windowMs / 1000);

    try {
      const pipeline = client.pipeline();
      pipeline.incr(redisKey);
      // Only set TTL on first hit — preserves sliding window accuracy
      pipeline.expire(redisKey, ttlSeconds, 'NX');
      const results = await pipeline.exec();
      const totalHits = (results?.[0]?.[1] as number) ?? 1;
      // Approximate reset time — accurate enough for retry-after headers
      const resetTime = new Date(Date.now() + this.windowMs);
      return { totalHits, resetTime };
    } catch (err) {
      // Fail open: Redis unavailable → allow request to prevent full outage
      logger.warn('[RateLimit] Redis store error — failing open', { prefix: this.prefix });
      return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    await getRedisClient()
      .decr(`${this.prefix}:${key}`)
      .catch(() => {});
  }

  async resetKey(key: string): Promise<void> {
    await getRedisClient()
      .del(`${this.prefix}:${key}`)
      .catch(() => {});
  }
}

const makeStore = (prefix: string, windowMs: number) =>
  new RedisRateLimitStore(prefix, windowMs) as unknown as Options['store'];

// ---------------------------------------------------------------------------
// Key generator: prefer authenticated userId over IP.
// Prevents IP-based bypass via proxies when the user is logged in.
// ---------------------------------------------------------------------------
const userOrIpKey = (req: Request): string => {
  return req.user?.userId ?? (req.ip as string);
};

// ---------------------------------------------------------------------------
// Rate limiter definitions — one per route group with independent Redis keys
// ---------------------------------------------------------------------------

/** Global baseline — applied to every request */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:global', env.RATE_LIMIT_WINDOW_MS),
  keyGenerator: userOrIpKey,
  handler: (_req, _res, next) =>
    next(AppError.tooManyRequests('Too many requests, please slow down')),
  skip: (req) => req.path === '/health',
});

/** Auth endpoints — strict: 10 attempts per 15 min per IP */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:auth', 15 * 60 * 1000),
  // Always key by IP for auth — user is not yet known at login time
  keyGenerator: (req) => req.ip as string,
  handler: (_req, _res, next) =>
    next(AppError.tooManyRequests('Too many auth attempts, please try again later')),
});

/** Search/list endpoints — medium: 120 req/min */
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:search', 60 * 1000),
  keyGenerator: userOrIpKey,
  handler: (_req, _res, next) =>
    next(AppError.tooManyRequests('Search rate limit exceeded, please wait')),
});

/** Mutation endpoints — normal: 60 req/min per user */
export const mutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:mutation', 60 * 1000),
  keyGenerator: userOrIpKey,
  handler: (_req, _res, next) =>
    next(AppError.tooManyRequests('Too many requests, please slow down')),
});

/** File upload — tight: 5 per minute */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  store: makeStore('rl:upload', 60 * 1000),
  keyGenerator: userOrIpKey,
  handler: (_req, _res, next) =>
    next(AppError.tooManyRequests('Too many uploads, please wait')),
});
