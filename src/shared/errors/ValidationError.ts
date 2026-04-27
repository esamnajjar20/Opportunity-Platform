import { AppError } from './AppError';

export interface ValidationFieldError {
  field: string;
  message: string;
}

export class ValidationError extends AppError {
  public readonly fields: ValidationFieldError[];

  constructor(message: string = 'Validation failed', fields: ValidationFieldError[] = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.fields = fields;
  }

  static fromZodError(zodError: {
    errors: Array<{ path: (string | number)[]; message: string }>;
  }): ValidationError {
    const fields: ValidationFieldError[] = zodError.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return new ValidationError('Validation failed', fields);
  }
}
