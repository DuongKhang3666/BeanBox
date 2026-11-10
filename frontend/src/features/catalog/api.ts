// Chỉ import từ Server Components (dùng serverGet, không gửi token).
import { ApiError } from "@/lib/api/errors";
import { serverGet } from "@/lib/api/server";
import type { PaginationMeta } from "@/types/api";
import type { Brand, CategoryNode, ProductDetail, ProductListItem } from "@/types/catalog";
import type { ApiQuery } from "./filters";

const TAXONOMY_REVALIDATE = 300;
const PRODUCT_REVALIDATE = 60;

export interface ProductPage {
  items: ProductListItem[];
  meta: PaginationMeta;
}

export async function getCategories(): Promise<CategoryNode[]> {
  const res = await serverGet<CategoryNode[]>("/categories", { revalidate: TAXONOMY_REVALIDATE });
  return res.data;
}

export async function getBrands(): Promise<Brand[]> {
  const res = await serverGet<Brand[]>("/brands", { revalidate: TAXONOMY_REVALIDATE });
  return res.data;
}

export async function getProducts(query: ApiQuery = {}): Promise<ProductPage> {
  const res = await serverGet<ProductListItem[], PaginationMeta>("/products", {
    query,
    revalidate: PRODUCT_REVALIDATE,
  });
  return {
    items: res.data,
    meta: res.meta ?? { page: 1, pageSize: res.data.length, total: res.data.length, totalPages: 1 },
  };
}

/** 404 -> null để trang gọi notFound(). Lỗi khác được ném tiếp. */
export async function getProduct(slug: string): Promise<ProductDetail | null> {
  try {
    const res = await serverGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
      revalidate: PRODUCT_REVALIDATE,
    });
    return res.data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Danh sách xuất xứ (a-z) lấy từ các sản phẩm cà phê hạt. */
export async function getCoffeeOrigins(categorySlug: string): Promise<string[]> {
  const { items } = await getProducts({ category: categorySlug, pageSize: 100 });
  const set = new Set<string>();
  for (const p of items) {
    const o = p.coffee?.originCountry?.trim();
    if (o) set.add(o);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "vi"));
}
