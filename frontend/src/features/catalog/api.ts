// Chỉ import từ Server Components (dùng serverGet, không gửi token).
import { ApiError } from "@/lib/api/errors";
import { serverGet } from "@/lib/api/server";
import type { PaginationMeta } from "@/types/api";
import { lookupFromError, type SlugLookup } from "@/lib/slugRedirect";
import type {
  Brand,
  CategoryDetail,
  CategoryNode,
  ProductDetail,
  ProductListItem,
} from "@/types/catalog";
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

export const BOUGHT_TOGETHER_LIMIT = 4;

/**
 * GET /products/:slug/bought-together (§4.6). Gợi ý chỉ là phần phụ của trang: mọi lỗi (mạng, 404,
 * 5xx) đều trả [] để trang sản phẩm không bị hỏng. Cùng cơ chế revalidate với dữ liệu sản phẩm.
 */
export async function getBoughtTogether(slug: string): Promise<ProductListItem[]> {
  try {
    const res = await serverGet<ProductListItem[]>(
      `/products/${encodeURIComponent(slug)}/bought-together`,
      { query: { limit: BOUGHT_TOGETHER_LIMIT }, revalidate: PRODUCT_REVALIDATE },
    );
    return Array.isArray(res.data) ? res.data.slice(0, BOUGHT_TOGETHER_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Như getProduct nhưng phân biệt slug cũ (404 + details.movedTo, D-018) với 404 thường. */
export async function lookupProduct(slug: string): Promise<SlugLookup<ProductDetail>> {
  try {
    const res = await serverGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`, {
      revalidate: PRODUCT_REVALIDATE,
    });
    return { status: "ok", data: res.data };
  } catch (e) {
    return lookupFromError(e);
  }
}

/** GET /categories/:slug (§14.5): thông tin danh mục hoặc slug cũ. */
export async function lookupCategory(slug: string): Promise<SlugLookup<CategoryDetail>> {
  try {
    const res = await serverGet<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: TAXONOMY_REVALIDATE,
    });
    return { status: "ok", data: res.data };
  } catch (e) {
    return lookupFromError(e);
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
