import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../../shared/errors/AppError';
import { ValidationError } from '../../shared/errors/ValidationError';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { getRequestId } from './correlationId.middleware';
import { env } from '../../config/env.schema';

export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = getRequestId();

  // Always log with full context (stack trace is safe in logs)
  logger.error(`[${req.method}] ${req.path}`, {
    requestId,
    error: error.message,
    code: (error as AppError).code,
    statusCode: (error as AppError).statusCode,
    userId: req.user?.userId,
    // Stack only in dev logs — never in the HTTP response
    stack: env.NODE_ENV !== 'production' ? error.stack : undefined,
  });

  // ── Validation errors ───────────────────────────────────────────────────────
  if (error instanceof ValidationError) {
    res.status(422).json({
      success: false,
      message: error.message,
      requestId,
      error: { code: error.code, fields: error.fields },
    });
    return;
  }

  // ── Known operational errors ────────────────────────────────────────────────
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      requestId,
      error: { code: error.code },
    });
    return;
  }

  // ── Mongoose duplicate key ──────────────────────────────────────────────────
  if (
    error instanceof mongoose.mongo.MongoServerError &&
    (error as { code?: number }).code === 11000
  ) {
    const field = Object.keys(
      (error as { keyValue?: Record<string, unknown> }).keyValue || {},
    )[0];
    res.status(409).json({
      success: false,
      message: `${field} already exists`,
      requestId,
      error: { code: 'CONFLICT' },
    });
    return;
  }

  // ── Mongoose validation error ───────────────────────────────────────────────
  if (error instanceof mongoose.Error.ValidationError) {
    const fields = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      requestId,
      error: { code: 'VALIDATION_ERROR', fields },
    });
    return;
  }

  // ── Mongoose cast error (bad ObjectId) ─────────────────────────────────────
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      message: `Invalid ${error.path}`,
      requestId,
      error: { code: 'INVALID_ID' },
    });
    return;
  }

  // ── Unknown / programmer errors ─────────────────────────────────────────────
  // In production: generic message, no internals exposed.
  // In development: full message for debugging (never in tests either).
  const isProd = env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : error.message,
    requestId,
    error: {
      code: 'INTERNAL_ERROR',
      // Stack NEVER sent to client — even in development. Use server logs.
    },
  });
};

// 404 catch-all
export const notFoundMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404, 'NOT_FOUND'));
};
