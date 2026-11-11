export const SITE_NAME = "BeanBox";
export const SITE_DESCRIPTION =
  "BeanBox - cửa hàng hạt cà phê, dụng cụ pha chế và phụ kiện dành cho người yêu cà phê tại Việt Nam.";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** Slug danh mục gốc (khớp seed/docs). Nav tĩnh để layout không phụ thuộc API. */
export const ROOT_CATEGORY_SLUGS = [
  "ca-phe-hat",
  "dung-cu-pha-che",
  "phu-kien",
  "qua-tang-combo",
] as const;

export type RootCategorySlug = (typeof ROOT_CATEGORY_SLUGS)[number];

export const COFFEE_BEANS_SLUG: RootCategorySlug = "ca-phe-hat";

export const MAIN_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: `/danh-muc/${ROOT_CATEGORY_SLUGS[0]}`, label: "Cà phê hạt" },
  { href: `/danh-muc/${ROOT_CATEGORY_SLUGS[1]}`, label: "Dụng cụ pha chế" },
  { href: `/danh-muc/${ROOT_CATEGORY_SLUGS[2]}`, label: "Phụ kiện" },
  { href: `/danh-muc/${ROOT_CATEGORY_SLUGS[3]}`, label: "Quà tặng & Combo" },
];

export const FOOTER_LINKS = [
  { href: "/gioi-thieu", label: "Giới thiệu" },
  { href: "/lien-he", label: "Liên hệ" },
  { href: "/tra-cuu-don-hang", label: "Tra cứu đơn hàng" },
] as const;

export const POLICY_LINKS = [
  { href: "/chinh-sach/van-chuyen", label: "Chính sách vận chuyển" },
  { href: "/chinh-sach/doi-tra", label: "Chính sách đổi trả" },
  { href: "/chinh-sach/bao-mat", label: "Chính sách bảo mật" },
  { href: "/chinh-sach/dieu-khoan", label: "Điều khoản mua hàng" },
] as const;

/** URL tuyệt đối từ đường dẫn tương đối (dùng cho Open Graph, JSON-LD, sitemap). */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
