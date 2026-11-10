import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Tối thiểu: trang tĩnh. Danh mục/sản phẩm sẽ thêm từ API ở M1. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/gioi-thieu",
    "/lien-he",
    "/tra-cuu-don-hang",
    "/chinh-sach/van-chuyen",
    "/chinh-sach/doi-tra",
    "/chinh-sach/bao-mat",
    "/chinh-sach/dieu-khoan",
  ];
  return paths.map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: "weekly",
    priority: p === "/" ? 1 : 0.5,
  }));
}
