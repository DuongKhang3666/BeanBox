import { AppError } from '../../../lib/errors.js';

/**
 * Khoảng ngày, kỳ so sánh và bucket cho phân tích kinh doanh (api-contract §16.1, D-050).
 * Mọi ngày là ngày lịch VN (UTC+7 cố định) dạng `YYYY-MM-DD`; tính toán qua "số ngày từ 1970-01-01"
 * nên không phụ thuộc múi giờ máy chạy.
 */

export type Granularity = 'day' | 'week' | 'month';

export const MAX_RANGE_DAYS = 366;
export const MIN_DATE = '2020-01-01';
export const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

/** `YYYY-MM-DD` (đã hợp lệ) -> số ngày từ 1970-01-01. */
export function dayNum(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function ymdOf(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export interface Bucket {
  start: string;
  end: string;
}

export interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  granularity: Granularity;
  previousFrom: string;
  previousTo: string;
}

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

export function defaultGranularity(days: number): Granularity {
  if (days <= 62) return 'day';
  if (days <= 184) return 'week';
  return 'month';
}

/**
 * Chuẩn hóa tham số (đã qua zod: đúng định dạng và ngày tồn tại). Thiếu `to` -> `from + 29`
 * (không quá hôm nay); thiếu `from` -> `to - 29`; thiếu cả hai -> 30 ngày kết thúc hôm nay.
 */
export function resolveRange(
  input: { from?: string | undefined; to?: string | undefined; granularity?: Granularity },
  today: string,
): ResolvedRange {
  const t = dayNum(today);
  let to = input.to ? dayNum(input.to) : undefined;
  let from = input.from ? dayNum(input.from) : undefined;
  if (to === undefined && from === undefined) to = t;
  if (to === undefined) to = Math.min(from! + DEFAULT_DAYS - 1, t);
  if (from === undefined) from = to - (DEFAULT_DAYS - 1);

  if (from < dayNum(MIN_DATE)) throw invalid('from', `from không được trước ${MIN_DATE}`);
  if (to > t) throw invalid('to', 'to không được sau ngày hôm nay');
  if (from > to) throw invalid('from', 'from phải nhỏ hơn hoặc bằng to');
  const days = to - from + 1;
  if (days > MAX_RANGE_DAYS) {
    throw invalid('to', `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày`);
  }
  const previousTo = from - 1;
  const previousFrom = previousTo - (days - 1);
  return {
    from: ymdOf(from),
    to: ymdOf(to),
    days,
    granularity: input.granularity ?? defaultGranularity(days),
    previousFrom: ymdOf(previousFrom),
    previousTo: ymdOf(previousTo),
  };
}

/** Thứ Hai đầu tuần chứa ngày `n` (1970-01-01 là thứ Năm). */
const weekStart = (n: number) => n - ((n + 3) % 7);

/** Bucket liên tục phủ [from, to]; bucket đầu/cuối bị cắt theo khoảng (D-050). */
export function buildBuckets(from: string, to: string, granularity: Granularity): Bucket[] {
  const a = dayNum(from);
  const b = dayNum(to);
  const out: Bucket[] = [];
  if (granularity === 'day') {
    for (let n = a; n <= b; n++) out.push({ start: ymdOf(n), end: ymdOf(n) });
    return out;
  }
  if (granularity === 'week') {
    for (let s = weekStart(a); s <= b; s += 7) {
      out.push({ start: ymdOf(Math.max(s, a)), end: ymdOf(Math.min(s + 6, b)) });
    }
    return out;
  }
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  let y = fy;
  let m = fm;
  for (;;) {
    const s = Math.round(Date.UTC(y, m - 1, 1) / DAY_MS);
    if (s > b) break;
    const e = Math.round(Date.UTC(y, m, 1) / DAY_MS) - 1; // ngày cuối tháng
    out.push({ start: ymdOf(Math.max(s, a)), end: ymdOf(Math.min(e, b)) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
