import Redis from 'ioredis';
import { env } from './env.schema';
import { logger } from '../core/utils/logger';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }

  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

// Cache helpers
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const client = getRedisClient();
  const data = await client.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds: number = 300,
): Promise<void> => {
  const client = getRedisClient();
  await client.setex(key, ttlSeconds, JSON.stringify(value));
};

export const cacheDel = async (key: string): Promise<void> => {
  const client = getRedisClient();
  await client.del(key);
};

export const cacheDelPattern = async (pattern: string): Promise<void> => {
  const client = getRedisClient();
  let cursor = '0';

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      // Pipeline per batch — avoids both the spread argument-limit and
      // accumulating all keys in memory before any are deleted.
      const pipeline = client.pipeline();
      keys.forEach((k) => pipeline.del(k));
      await pipeline.exec();
    }
  } while (cursor !== '0');
};
