/** Chuẩn hóa để tìm không dấu (giống backend/src/lib/text.ts). */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mọi token của query đều nằm trong tên (so sánh sau chuẩn hóa). Query rỗng khớp tất cả. */
export function matchesQuery(name: string, query: string): boolean {
  const tokens = normalizeSearch(query)
    .split(" ")
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  const hay = normalizeSearch(name);
  return tokens.every((t) => hay.includes(t));
}
