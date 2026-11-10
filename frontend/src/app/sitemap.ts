import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getCategories, getProducts } from "@/features/catalog/api";
import { SITE_URL } from "@/lib/site";

const MAX_PRODUCT_PAGES = 10;

const STATIC_PATHS = [
  "/",
  "/gioi-thieu",
  "/lien-he",
  "/tra-cuu-don-hang",
  "/chinh-sach/van-chuyen",
  "/chinh-sach/doi-tra",
  "/chinh-sach/bao-mat",
  "/chinh-sach/dieu-khoan",
];

const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${path}`,
  changeFrequency: "weekly",
  priority,
});

async function dynamicPaths(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  const categories = await getCategories();
  for (const root of categories) {
    out.push(entry(`/danh-muc/${root.slug}`, 0.8));
    for (const child of root.children) out.push(entry(`/danh-muc/${child.slug}`, 0.7));
  }
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const res = await getProducts({ pageSize: 100, page });
    for (const p of res.items) out.push(entry(`/san-pham/${p.slug}`, 0.6));
    if (page >= res.meta.totalPages) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Chỉ dựng lúc có request để build không phụ thuộc backend.
  await connection();
  const base = STATIC_PATHS.map((p) => entry(p, p === "/" ? 1 : 0.5));
  try {
    return [...base, ...(await dynamicPaths())];
  } catch {
    return base;
  }
}
