/**
 * Ghi CSV an toàn cho Excel (api-contract §16.4, D-053): UTF-8 có BOM, phân tách dấu phẩy, CRLF,
 * RFC 4180, chống CSV injection.
 *
 * Ô có kiểu:
 * - `number`: server sinh từ số đã kiểm `Number.isFinite`, ghi thẳng (số âm như -12.5 vẫn là số);
 *   không hữu hạn -> ô trống.
 * - `string`: nếu ký tự ĐẦU là `=`, `+`, `-`, `@`, tab hoặc CR thì thêm tiền tố `'`, sau đó mới
 *   áp quy tắc bọc ngoặc kép. Không trim dữ liệu: chỉ xét ký tự đầu của chuỗi gốc.
 * - `null`/`undefined`: ô trống.
 */
export type CsvCell = string | number | null | undefined;
export type CsvRow = readonly CsvCell[];

export const CSV_BOM = '﻿';
const DANGEROUS_FIRST = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Vô hiệu công thức: thêm `'` trước chuỗi bắt đầu bằng ký tự nguy hiểm. */
export function neutralizeFormula(s: string): string {
  return s.length > 0 && DANGEROUS_FIRST.has(s[0]!) ? `'${s}` : s;
}

/** RFC 4180: bọc `"` khi có dấu phẩy, `"`, CR hoặc LF; nhân đôi `"` bên trong. */
export function quoteField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  return quoteField(neutralizeFormula(cell));
}

/** BOM + các dòng nối bằng CRLF (có CRLF cuối). */
export function toCsv(rows: readonly CsvRow[]): string {
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(',') + '\r\n').join('');
}

const SAFE_FILENAME = /^[a-z0-9_.-]+$/;

/** camelCase -> kebab-case thường (`paymentMethod` -> `payment-method`). */
export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Tên file CSV chỉ dựng từ giá trị đã validate (enum và ngày `YYYY-MM-DD`). Mọi phần ngoài
 * `[a-z0-9_.-]` làm hàm ném lỗi (lỗi lập trình, không bao giờ xảy ra với input hợp lệ).
 */
export function safeCsvFilename(parts: {
  report: string;
  qualifier?: string | undefined;
  dates: string;
}): string {
  const name = [
    'beanbox',
    parts.report,
    parts.qualifier ? kebab(parts.qualifier) : null,
    parts.dates,
  ]
    .filter((x): x is string => Boolean(x))
    .join('-');
  const file = `${name}.csv`;
  if (!SAFE_FILENAME.test(file)) throw new Error('Tên file CSV không an toàn');
  return file;
}
