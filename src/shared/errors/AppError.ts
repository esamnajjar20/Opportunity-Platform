export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  static tooManyRequests(message: string = 'Too many requests'): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }
}
