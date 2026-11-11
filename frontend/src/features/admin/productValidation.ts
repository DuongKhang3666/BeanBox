/** Validate + chuẩn hóa phía client cho sản phẩm/biến thể, theo docs/api-contract.md §12.4. */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-11-10T15:30" (giờ VN) -> ISO UTC "2026-11-10T08:30:00.000Z"; sai định dạng -> null. */
export function vnLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi) - VN_OFFSET_MS;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO UTC -> giá trị cho input datetime-local theo giờ VN ("" nếu rỗng/sai). */
export function isoToVnLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + VN_OFFSET_MS).toISOString().slice(0, 16);
}

/** "A, b ,a" -> ["a", "b"]: trim, lowercase, bỏ rỗng và trùng. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Danh sách phân cách dấu phẩy, giữ nguyên hoa/thường (tasting notes). */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function productNameError(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "Vui lòng nhập tên sản phẩm.";
  if (n.length < 2) return "Tên tối thiểu 2 ký tự.";
  if (n.length > 200) return "Tên tối đa 200 ký tự.";
  return undefined;
}

export function maxLenError(text: string, max: number, label: string): string | undefined {
  return text.trim().length > max
    ? `${label} tối đa ${max.toLocaleString("vi-VN")} ký tự.`
    : undefined;
}

export function tagsError(tags: string[]): string | undefined {
  if (tags.length > 20) return "Tối đa 20 thẻ.";
  if (tags.some((t) => t.length > 30)) return "Mỗi thẻ tối đa 30 ký tự.";
  return undefined;
}

export function tastingNotesError(notes: string[]): string | undefined {
  if (notes.length > 10) return "Tối đa 10 hương vị.";
  if (notes.some((t) => t.length > 40)) return "Mỗi hương vị tối đa 40 ký tự.";
  return undefined;
}

export function altitudeError(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (!/^\d+$/.test(t) || Number(t) > 3000) return "Độ cao phải là số nguyên từ 0 đến 3000 m.";
  return undefined;
}

/* ---------- Biến thể ---------- */

export const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

export function skuError(sku: string): string | undefined {
  const s = sku.trim().toUpperCase();
  if (!s) return "Vui lòng nhập SKU.";
  if (!SKU_RE.test(s))
    return "SKU gồm 2–40 ký tự chữ in hoa, số hoặc dấu gạch ngang, bắt đầu bằng chữ hoặc số.";
  return undefined;
}

export function variantNameError(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "Vui lòng nhập tên biến thể.";
  if (n.length > 100) return "Tên tối đa 100 ký tự.";
  return undefined;
}

export function intRangeError(
  raw: string,
  min: number,
  max: number,
  label: string,
): string | undefined {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return `${label} phải là số nguyên từ ${fmt(min)} đến ${fmt(max)}.`;
  const n = Number(t);
  return n < min || n > max
    ? `${label} phải là số nguyên từ ${fmt(min)} đến ${fmt(max)}.`
    : undefined;
}

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export interface AttrRow {
  key: string;
  value: string;
}

/** Hàng trống hoàn toàn bị bỏ; trả lỗi hoặc object thuộc tính. */
export function attributesResult(rows: AttrRow[]): {
  value: Record<string, string>;
  error?: string;
} {
  const value: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    const v = r.value.trim();
    if (!k && !v) continue;
    if (!k || !v) return { value, error: "Mỗi thuộc tính cần đủ tên và giá trị." };
    if (k.length > 30) return { value, error: "Tên thuộc tính tối đa 30 ký tự." };
    if (v.length > 50) return { value, error: "Giá trị thuộc tính tối đa 50 ký tự." };
    if (k in value) return { value, error: `Thuộc tính "${k}" bị trùng.` };
    value[k] = v;
  }
  if (Object.keys(value).length > 10) return { value, error: "Tối đa 10 thuộc tính." };
  return { value };
}
