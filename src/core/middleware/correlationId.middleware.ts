import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
}

// AsyncLocalStorage propagates requestId across all async continuations
// (service calls, event handlers, queue workers) without threading it through args
export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getRequestId = (): string =>
  requestContext.getStore()?.requestId ?? 'no-ctx';

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Accept upstream requestId (from API gateway / load balancer) or generate a new one
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();

  // Echo back so clients can correlate their own logs with server logs
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, next);
};
