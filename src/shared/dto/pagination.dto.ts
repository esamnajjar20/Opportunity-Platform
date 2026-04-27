import { z } from 'zod';

export const PaginationDtoSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform(Number)
    .refine((n) => n > 0, 'page must be positive'),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform(Number)
    .refine((n) => n > 0 && n <= 100, 'limit must be between 1 and 100'),
});

export type PaginationDto = z.infer<typeof PaginationDtoSchema>;
