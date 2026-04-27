import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../config/env.schema';
import { AppError } from '../../shared/errors/AppError';
import { getRedisClient } from '../../config/redis';

export interface TokenPayload {
  userId: string;
  role: string;
  // email intentionally omitted — JWTs are trivially decoded by anyone with the token.
  // Use userId to look up email when needed (profile endpoint, notifications).
}

export interface DecodedToken extends TokenPayload, JwtPayload {
  jti: string; // guaranteed present on all tokens we issue
}

// ─── Access token TTL in seconds (derived from env string like "15m") ────────
const parseExpiresInSeconds = (str: string): number => {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // fallback 15m
  const n = parseInt(match[1], 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (multipliers[match[2]] ?? 1);
};

const ACCESS_TOKEN_TTL_SECONDS = parseExpiresInSeconds(env.JWT_ACCESS_EXPIRES_IN);

// Redis key namespace for blacklisted JTIs
const jtiBlacklistKey = (jti: string) => `jwt:blacklist:${jti}`;

// ─── Token generation ─────────────────────────────────────────────────────────

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as SignOptions,
  );
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions,
  );
};

// ─── Token verification ───────────────────────────────────────────────────────

export const verifyAccessToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as DecodedToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid access token', 401, 'TOKEN_INVALID');
  }
};

export const verifyRefreshToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as DecodedToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
    }
    throw new AppError('Invalid refresh token', 401, 'REFRESH_TOKEN_INVALID');
  }
};

export const decodeToken = (token: string): DecodedToken | null => {
  try {
    return jwt.decode(token) as DecodedToken;
  } catch {
    return null;
  }
};

// ─── JTI blacklist (Redis-backed, auto-expires with token TTL) ────────────────

/**
 * Blacklist a specific access token's JTI.
 * TTL is set to the remaining token lifetime so Redis auto-purges it.
 * Used by logout and logoutAll to immediately invalidate issued access tokens.
 */
export const blacklistAccessToken = async (token: string): Promise<void> => {
  const decoded = decodeToken(token);
  if (!decoded?.jti) return;

  const now = Math.floor(Date.now() / 1000);
  const exp = decoded.exp ?? now + ACCESS_TOKEN_TTL_SECONDS;
  const remainingTtl = Math.max(1, exp - now);

  try {
    await getRedisClient().setex(jtiBlacklistKey(decoded.jti), remainingTtl, '1');
  } catch {
    // Non-fatal: if Redis is down, blacklist silently fails.
    // The token still expires naturally in ACCESS_TOKEN_TTL_SECONDS.
  }
};

/**
 * Check whether a JTI has been blacklisted.
 * Called in auth middleware — fast Redis GET, ~0.5ms overhead.
 */
export const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
  try {
    const result = await getRedisClient().get(jtiBlacklistKey(jti));
    return result === '1';
  } catch {
    // Redis down: fail open (allow request) to avoid locking out all users
    return false;
  }
};
