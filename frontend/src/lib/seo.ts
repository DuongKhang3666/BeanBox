/**
 * D-069: đường dẫn bị chặn trong robots.txt (không có giá trị cho crawler, hoặc là API).
 * Trang riêng tư khác KHÔNG nằm ở đây: chúng phải đọc được để crawler thấy meta noindex.
 */
export const ROBOTS_DISALLOW_PATHS = ["/admin", "/api/"] as const;

/** D-069: trang riêng tư/không nên lập chỉ mục; mỗi trang tự khai báo `robots: { index: false }`. */
export const NOINDEX_PATHS = [
  "/tai-khoan",
  "/gio-hang",
  "/so-sanh",
  "/thanh-toan",
  "/cong-thanh-toan-gia-lap",
  "/dat-hang-thanh-cong",
  "/tra-cuu-don-hang",
  "/tim-kiem",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dat-lai-mat-khau",
  "/xac-thuc-email",
] as const;

/** Mọi đường dẫn không được xuất hiện trong sitemap. */
export const PRIVATE_PATHS = [...ROBOTS_DISALLOW_PATHS, ...NOINDEX_PATHS] as const;
