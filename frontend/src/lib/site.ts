export const SITE_NAME = "BeanBox";
export const SITE_DESCRIPTION =
  "BeanBox - cửa hàng hạt cà phê, dụng cụ pha chế và phụ kiện dành cho người yêu cà phê tại Việt Nam.";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** Danh mục chính tĩnh tạm thời, sẽ thay bằng dữ liệu API ở M1. */
export const MAIN_NAV = [
  { href: "/danh-muc/hat-ca-phe", label: "Hạt cà phê" },
  { href: "/danh-muc/dung-cu-pha-che", label: "Dụng cụ pha chế" },
  { href: "/danh-muc/phu-kien", label: "Phụ kiện" },
] as const;

export const FOOTER_LINKS = [
  { href: "/gioi-thieu", label: "Giới thiệu" },
  { href: "/lien-he", label: "Liên hệ" },
  { href: "/tra-cuu-don-hang", label: "Tra cứu đơn hàng" },
] as const;

export const POLICY_LINKS = [
  { href: "/chinh-sach/van-chuyen", label: "Chính sách vận chuyển" },
  { href: "/chinh-sach/doi-tra", label: "Chính sách đổi trả" },
  { href: "/chinh-sach/bao-mat", label: "Chính sách bảo mật" },
  { href: "/chinh-sach/dieu-khoan", label: "Điều khoản sử dụng" },
] as const;
