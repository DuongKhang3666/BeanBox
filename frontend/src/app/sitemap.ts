import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getCategories, getProducts } from "@/features/catalog/api";
import { SITE_URL } from "@/lib/site";
import type { CategoryNode } from "@/types/catalog";

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

// Không đặt changeFrequency/priority: Google bỏ qua cả hai và giá trị cứng không phản ánh dữ liệu thật (D-064).
// lastModified chỉ có khi có nguồn thật (Product.updatedAt từ API, contract 0.23).
const entry = (path: string, lastModified?: string | null): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${path}`,
  ...(lastModified && !Number.isNaN(Date.parse(lastModified))
    ? { lastModified: new Date(lastModified) }
    : {}),
});

const maxIso = (a: string | undefined, b: string | undefined) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

interface ProductStamp {
  slug: string;
  categorySlug?: string;
  updatedAt?: string;
}

async function loadProducts(): Promise<ProductStamp[]> {
  const out: ProductStamp[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const res = await getProducts({ pageSize: 100, page });
    for (const p of res.items)
      out.push({ slug: p.slug, categorySlug: p.category?.slug, updatedAt: p.updatedAt });
    if (page >= res.meta.totalPages) break;
  }
  return out;
}

/** lastmod danh mục = updatedAt mới nhất của sản phẩm trong danh mục (danh mục cha gồm cả con). */
function categoryEntries(tree: CategoryNode[], products: ProductStamp[]): MetadataRoute.Sitemap {
  const latest = new Map<string, string>();
  for (const p of products) {
    if (p.categorySlug)
      latest.set(p.categorySlug, maxIso(latest.get(p.categorySlug), p.updatedAt)!);
  }
  const out: MetadataRoute.Sitemap = [];
  for (const root of tree) {
    let rootLatest = latest.get(root.slug);
    const children: MetadataRoute.Sitemap = [];
    for (const child of root.children) {
      const c = latest.get(child.slug);
      rootLatest = maxIso(rootLatest, c);
      children.push(entry(`/danh-muc/${child.slug}`, c));
    }
    out.push(entry(`/danh-muc/${root.slug}`, rootLatest), ...children);
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Chỉ dựng lúc có request để build không phụ thuộc backend.
  await connection();
  const base = STATIC_PATHS.map((p) => entry(p));
  // Mỗi nguồn lỗi độc lập: API hỏng vẫn trả các trang còn lại.
  const [prods, cats] = await Promise.allSettled([loadProducts(), getCategories()]);
  const products = prods.status === "fulfilled" ? prods.value : [];
  const catEntries = cats.status === "fulfilled" ? categoryEntries(cats.value, products) : [];
  return [
    ...base,
    ...catEntries,
    ...products.map((p) => entry(`/san-pham/${p.slug}`, p.updatedAt)),
  ];
}
