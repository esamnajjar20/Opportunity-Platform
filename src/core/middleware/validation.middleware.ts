import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../../shared/errors/ValidationError';

type ValidationTarget = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, target: ValidationTarget = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);

      // Mutate the request with parsed/coerced data
      (req as unknown as Record<string, unknown>)[target] = parsed;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(ValidationError.fromZodError(error));
      }
      next(error);
    }
  };

export const validateBody = (schema: ZodSchema) => validate(schema, 'body');
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');
