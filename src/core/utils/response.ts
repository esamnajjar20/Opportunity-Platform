import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    details?: unknown;
  };
}

export class ResponseUtil {
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200,
    meta?: Record<string, unknown>,
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      ...(meta && { meta }),
    };
    return res.status(statusCode).json(response);
  }

  static created<T>(res: Response, data: T, message: string = 'Created successfully'): Response {
    return ResponseUtil.success(res, data, message, 201);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static paginated<T>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    },
    message: string = 'Success',
  ): Response {
    return ResponseUtil.success(res, data, message, 200, { pagination });
  }

  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown,
  ): Response {
    const errorObj: { code: string; details?: unknown } = { code };
    if (details) {
      errorObj.details = details;
    }
    const response: ApiResponse = {
      success: false,
      message,
      error: errorObj,
    };
    return res.status(statusCode).json(response);
  }
}
