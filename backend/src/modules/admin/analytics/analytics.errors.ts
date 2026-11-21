import type { ErrorRequestHandler } from 'express';
import { AppError } from '../../../lib/errors.js';

/** Mã lỗi Postgres `query_canceled` (do `statement_timeout`), D-058. */
const QUERY_CANCELED = '57014';

/**
 * Lỗi truy vấn bị Postgres hủy vì quá `statement_timeout`? Với Prisma 7 + adapter-pg, `$queryRaw`
 * ném `PrismaClientKnownRequestError` (P2010) có `meta.driverAdapterError.cause.code = '57014'`;
 * dò thêm vài dạng khác (code/originalCode ở các tầng) để không phụ thuộc đúng một dạng bọc lỗi.
 */
export function isQueryCanceled(err: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): boolean => {
    if (typeof v !== 'object' || v === null || depth > 5 || seen.has(v)) return false;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.code === QUERY_CANCELED || o.originalCode === QUERY_CANCELED) return true;
    return (
      visit(o.cause, depth + 1) ||
      visit(o.meta, depth + 1) ||
      visit(o.driverAdapterError, depth + 1)
    );
  };
  return visit(err, 0);
}

export const analyticsTimeoutError = () =>
  new AppError(503, 'ANALYTICS_TIMEOUT', 'Truy vấn phân tích quá lâu, hãy thu hẹp khoảng ngày');

/** Đổi lỗi hủy truy vấn thành 503 `ANALYTICS_TIMEOUT`; lỗi khác chuyển tiếp nguyên vẹn. */
export const mapAnalyticsErrors: ErrorRequestHandler = (err, _req, _res, next) => {
  next(isQueryCanceled(err) ? analyticsTimeoutError() : err);
};
