/**
 * Đường dẫn thuộc khu admin: "/admin", "/admin/x", "/admin?x", "/admin#x"; không khớp "/adminx".
 * Vào khu admin phải tải trang đầy đủ để áp CSP chặt của /admin (CSP theo tài liệu, xem src/proxy.ts).
 */
export function isAdminPath(path: string): boolean {
  return /^\/admin(?:[/?#]|$)/.test(path);
}
