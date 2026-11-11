import { z } from 'zod';

/** Số nguyên không âm từ query string. */
export const intParam = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `${label} phải từ ${min} đến ${max}`)
        .max(max, `${label} phải từ ${min} đến ${max}`),
    );

export const paginationShape = {
  page: intParam(1, 1_000_000, 'page').default(1),
  pageSize: intParam(1, 100, 'pageSize').default(20),
};

/** Danh sách enum phân cách phẩy (cũng nhận tham số lặp). Rỗng -> undefined; giá trị sai -> 400. */
export function csvEnum<T extends readonly [string, ...string[]]>(values: T, message: string) {
  return z
    .preprocess(
      (v) => (Array.isArray(v) ? v.join(',') : v),
      z
        .string()
        .transform((s) =>
          s
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x.length > 0),
        )
        .pipe(z.array(z.enum(values, { error: message })).max(values.length * 2))
        .transform((arr) => (arr.length > 0 ? [...new Set(arr)] : undefined)),
    )
    .optional();
}

/** Ngày YYYY-MM-DD hợp lệ theo lịch (loại 2026-02-31). */
export const dateOnly = (label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} phải có dạng YYYY-MM-DD`)
    .refine((s) => {
      const [y, m, d] = s.split('-').map(Number) as [number, number, number];
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }, `${label} không phải ngày hợp lệ`);

const VN_OFFSET = '+07:00';
/** Đầu ngày / cuối ngày theo giờ Việt Nam (UTC+7) của `YYYY-MM-DD`. */
export const vnDayStart = (d: string) => new Date(`${d}T00:00:00.000${VN_OFFSET}`);
export const vnDayEnd = (d: string) => new Date(`${d}T23:59:59.999${VN_OFFSET}`);

/** Kiểm tra `from <= to` cho object có hai trường ngày tùy chọn. */
export function refineDateRange(
  v: { from?: string | undefined; to?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if (v.from && v.to && v.from > v.to) {
    ctx.addIssue({
      code: 'custom',
      path: ['from'],
      message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
    });
  }
}

/** ID (cuid) dùng trong path/body/query admin: 1-50 ký tự [a-z0-9]. */
export const ID_REGEX = /^[a-z0-9]{1,50}$/;
export const idString = (label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .regex(ID_REGEX, `${label} không hợp lệ`);

/**
 * URL ảnh (api-contract §12.3): <= 500 ký tự và là `/uploads/...` (không chứa `..`, `\`, `//`)
 * hoặc `https://` hợp lệ. Mọi scheme khác (javascript:, data:, http:...) bị từ chối.
 */
export function isValidImageUrl(raw: string): boolean {
  if (raw.length === 0 || raw.length > 500) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return false;
  if (raw.startsWith('/uploads/')) {
    if (raw.includes('..') || raw.includes('\\') || raw.includes('//')) return false;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return false;
    }
    return !decoded.includes('..') && !decoded.includes('\\') && !decoded.includes('//');
  }
  if (raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' && u.hostname.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

export const imageUrlSchema = z
  .string({ error: 'Đường dẫn ảnh không hợp lệ' })
  .trim()
  .max(500, 'Đường dẫn ảnh tối đa 500 ký tự')
  .refine(isValidImageUrl, 'Đường dẫn ảnh phải bắt đầu bằng /uploads/ hoặc https://');
