export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedData<T> {
  data: T[];
  pagination: Omit<PaginationResult, 'skip'>;
}

export const parsePagination = (options: PaginationOptions): { page: number; limit: number; skip: number } => {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPaginationResult = (
  page: number,
  limit: number,
  total: number,
): Omit<PaginationResult, 'skip'> => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

export const paginate = async <T>(
  queryFn: (skip: number, limit: number) => Promise<T[]>,
  countFn: () => Promise<number>,
  options: PaginationOptions,
): Promise<PaginatedData<T>> => {
  const { page, limit, skip } = parsePagination(options);
  const [data, total] = await Promise.all([queryFn(skip, limit), countFn()]);
  const pagination = buildPaginationResult(page, limit, total);
  return { data, pagination };
};
