import type { Profile, Company } from './users';

export type RequestContext = {
  user: Profile;
  company: Company;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type PaginationParams = {
  limit?: number;
  offset?: number;
};
