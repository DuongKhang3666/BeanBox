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

/** Ký tự đầu tiên sau chuỗi `'` mở đầu (có thể rỗng). */
const firstAfterQuotes = (s: string): string => {
  let i = 0;
  while (s[i] === "'") i++;
  return s[i] ?? '';
};

/**
 * Vô hiệu công thức: thêm `'` trước chuỗi bắt đầu bằng ký tự nguy hiểm. Chuỗi bắt đầu bằng một
 * hay nhiều `'` rồi tới ký tự nguy hiểm (vd `'=a`) cũng được thêm `'`, để `unneutralizeFormula` là
 * nghịch đảo CHÍNH XÁC (D-073): `'=a` -> `''=a` -> đọc lại đúng `'=a`.
 */
export function neutralizeFormula(s: string): string {
  return DANGEROUS_FIRST.has(firstAfterQuotes(s)) ? `'${s}` : s;
}

/**
 * Nghịch đảo của `neutralizeFormula` khi NHẬP CSV (D-073): bỏ MỘT `'` đầu khi ô bắt đầu bằng
 * `'` (một hay nhiều) rồi tới ký tự nguy hiểm (=, +, -, @, tab, CR). Ô như `'Cà phê` giữ nguyên.
 */
export function unneutralizeFormula(s: string): string {
  return s[0] === "'" && DANGEROUS_FIRST.has(firstAfterQuotes(s)) ? s.slice(1) : s;
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

export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Đọc CSV theo RFC 4180: bỏ BOM đầu, dòng kết thúc CRLF/LF/CR, ô bọc `"` (nhân đôi `""`, được
 * chứa dấu phẩy và xuống dòng). Dòng trống hoàn toàn bị bỏ qua. KHÔNG đảo tiền tố `'`
 * (việc của lớp nhập, xem `unneutralizeFormula`). Lỗi định dạng ném `CsvParseError` (kèm số dòng).
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let wasQuoted = false;
  let line = 1;
  let rowStartLine = 1;

  const endField = () => {
    row.push(field);
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (field !== '' || wasQuoted) {
        throw new CsvParseError('Dấu ngoặc kép nằm giữa nội dung ô', line);
      }
      inQuotes = true;
      wasQuoted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++;
      endRow();
    } else {
      if (wasQuoted) throw new CsvParseError('Có ký tự thừa sau dấu ngoặc kép đóng', line);
      field += c;
    }
  }
  if (inQuotes) throw new CsvParseError('Dấu ngoặc kép chưa được đóng', rowStartLine);
  if (field !== '' || row.length > 0 || wasQuoted) endRow();
  return rows;
}
