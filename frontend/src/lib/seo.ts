/** Đường dẫn riêng tư/không nên lập chỉ mục: dùng cho robots.txt (và kiểm tra sitemap). */
export const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/tai-khoan",
  "/gio-hang",
  "/so-sanh",
  "/thanh-toan",
  "/dat-hang-thanh-cong",
  "/tra-cuu-don-hang",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dat-lai-mat-khau",
  "/xac-thuc-email",
] as const;
