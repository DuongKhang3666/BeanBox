/** Validate phía client cho danh mục/thương hiệu, theo docs/api-contract.md §12.3. */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Gợi ý slug từ tên: bỏ dấu tiếng Việt, đ -> d, lowercase, nối bằng gạch ngang. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nameError(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "Vui lòng nhập tên.";
  if (n.length < 2) return "Tên tối thiểu 2 ký tự.";
  if (n.length > 100) return "Tên tối đa 100 ký tự.";
  return undefined;
}

/** Slug tùy chọn: rỗng là hợp lệ (server tự sinh). */
export function slugError(slug: string): string | undefined {
  const s = slug.trim();
  if (!s) return undefined;
  if (s.length < 2) return "Slug tối thiểu 2 ký tự.";
  if (s.length > 120) return "Slug tối đa 120 ký tự.";
  if (!SLUG_RE.test(s))
    return "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang giữa các từ.";
  return undefined;
}

/** URL ảnh tùy chọn: /uploads/... (tương đối) hoặc https://. */
export function imageUrlError(url: string): string | undefined {
  const u = url.trim();
  if (!u) return undefined;
  if (u.length > 500) return "URL tối đa 500 ký tự.";
  const relative =
    u.startsWith("/uploads/") && !u.includes("..") && !u.includes("\\") && !u.includes("//");
  if (!relative && !/^https:\/\/\S+$/i.test(u)) {
    return "URL ảnh phải bắt đầu bằng https:// hoặc /uploads/.";
  }
  return undefined;
}

export function descriptionError(text: string): string | undefined {
  return text.trim().length > 1000 ? "Mô tả tối đa 1000 ký tự." : undefined;
}

export function sortOrderError(raw: string): string | undefined {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return "Thứ tự phải là số nguyên từ 0 đến 9999.";
  const n = Number(t);
  return n > 9999 ? "Thứ tự phải là số nguyên từ 0 đến 9999." : undefined;
}
