import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenBlacklisted, TokenPayload } from '../utils/jwt';
import { AppError } from '../../shared/errors/AppError';

// Augment Express Request with typed user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload & { userId: string; jti?: string };
    }
  }
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) throw AppError.unauthorized('Malformed token');

    const decoded = verifyAccessToken(token);

    // JTI blacklist check — catches revoked tokens from logout/logoutAll
    // Single Redis GET, ~0.5ms. Only runs if token has jti (all newly issued tokens do).
    if (decoded.jti) {
      const revoked = await isTokenBlacklisted(decoded.jti);
      if (revoked) {
        throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
};

// Optional auth — never fails even without token
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = verifyAccessToken(token);
        if (decoded.jti) {
          const revoked = await isTokenBlacklisted(decoded.jti);
          if (!revoked) req.user = decoded;
        } else {
          req.user = decoded;
        }
      }
    }
  } catch {
    // swallow — auth is optional on this route
  }
  next();
};
