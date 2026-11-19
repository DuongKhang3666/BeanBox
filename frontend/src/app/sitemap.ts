import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getCategories, getProducts } from "@/features/catalog/api";
import { SITE_URL } from "@/lib/site";

const MAX_PRODUCT_PAGES = 10;

// Chỉ trang công khai, nên được lập chỉ mục (không có trang riêng tư/tra cứu đơn).
export const STATIC_PATHS = [
  "/",
  "/gioi-thieu",
  "/lien-he",
  "/chinh-sach/van-chuyen",
  "/chinh-sach/doi-tra",
  "/chinh-sach/bao-mat",
  "/chinh-sach/dieu-khoan",
];

const entry = (
  path: string,
  priority: number,
  lastModified?: string,
): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${path}`,
  ...(lastModified && !Number.isNaN(Date.parse(lastModified))
    ? { lastModified: new Date(lastModified) }
    : {}),
  changeFrequency: "weekly",
  priority,
});

async function categoryEntries(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  for (const root of await getCategories()) {
    out.push(entry(`/danh-muc/${root.slug}`, 0.8));
    for (const child of root.children) out.push(entry(`/danh-muc/${child.slug}`, 0.7));
  }
  return out;
}

async function productEntries(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const res = await getProducts({ pageSize: 100, page });
    // API công khai hiện chưa trả updatedAt; có thì dùng làm lastModified.
    for (const p of res.items) out.push(entry(`/san-pham/${p.slug}`, 0.6, p.updatedAt));
    if (page >= res.meta.totalPages) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Chỉ dựng lúc có request để build không phụ thuộc backend.
  await connection();
  const base = STATIC_PATHS.map((p) => entry(p, p === "/" ? 1 : 0.5));
  // Mỗi nguồn lỗi độc lập: API hỏng vẫn trả các trang còn lại.
  const [cats, prods] = await Promise.allSettled([categoryEntries(), productEntries()]);
  return [
    ...base,
    ...(cats.status === "fulfilled" ? cats.value : []),
    ...(prods.status === "fulfilled" ? prods.value : []),
  ];
}
