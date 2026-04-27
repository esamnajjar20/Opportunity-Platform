import winston from 'winston';
import { env } from '../../config/env.schema';

// requestContext is imported lazily to avoid circular dependency
// (logger is imported by correlationId.middleware, which is imported by app.ts)
const getRequestId = (): string => {
  try {
    // Dynamic require avoids circular import at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequestId: _get } = require('../middleware/correlationId.middleware');
    return _get();
  } catch {
    return 'no-ctx';
  }
};

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format that injects requestId into every log line
const withRequestId = winston.format((info) => {
  info.requestId = getRequestId();
  return info;
});

const devFormat = combine(
  withRequestId(),
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, requestId, stack, ...meta }) => {
    const rid = requestId && requestId !== 'no-ctx' ? ` [${requestId}]` : '';
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}]${rid} ${level}: ${stack || message}${metaStr}`;
  }),
);

const prodFormat = combine(
  withRequestId(),
  timestamp(),
  errors({ stack: true }),
  json(),
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'opportunity-platform' },
  transports: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exceptionHandlers:
    env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: 'logs/exceptions.log' })]
      : [],
  rejectionHandlers:
    env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: 'logs/rejections.log' })]
      : [],
});
