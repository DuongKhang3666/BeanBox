/** Kiểu chung theo docs/api-contract.md §1-§2. */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "TOKEN_INVALID"
  | "INVALID_PASSWORD"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "INVALID_REFRESH_TOKEN"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "INVALID_ORIGIN"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "EMAIL_TAKEN"
  | "OUT_OF_STOCK"
  | "QUANTITY_LIMIT_EXCEEDED"
  | "ITEM_UNAVAILABLE"
  | "CART_EMPTY"
  | "COUPON_INVALID"
  | "PRICE_CHANGED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "ADDRESS_LIMIT_REACHED"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

/** Mã lỗi phía client (không đến từ backend). */
export type ClientErrorCode = "NETWORK_ERROR" | "UNKNOWN_ERROR";

export interface FieldErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | (string & {});
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T, M = unknown> {
  data: T;
  meta?: M;
}

export type Paginated<T> = { data: T[]; meta: PaginationMeta };
