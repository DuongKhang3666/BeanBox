/**
 * Chuẩn hóa chuỗi để tìm kiếm không dấu: lowercase, NFD, bỏ dấu kết hợp, `đ -> d`,
 * gộp khoảng trắng, trim. Dùng chung cho `Product.searchText` và query người dùng.
 */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách query đã chuẩn hóa thành các token không rỗng. */
export function tokenize(q: string): string[] {
  return normalizeSearch(q)
    .split(' ')
    .filter((t) => t.length > 0);
}

/**
 * Escape ký tự đại diện của LIKE/ILIKE (`\`, `%`, `_`). Prisma `contains`/`startsWith`/`equals` (insensitive)
 * không tự escape, nên input người dùng phải qua hàm này để `%` và `_` chỉ là ký tự thường.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}
