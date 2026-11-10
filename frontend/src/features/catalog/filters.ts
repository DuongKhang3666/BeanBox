import type { BrewMethod, CoffeeProcess, ProductSort, RoastLevel } from "@/types/catalog";
import { BREW_VALUES, PROCESS_VALUES, ROAST_VALUES, SORT_VALUES } from "./labels";

export const PAGE_SIZES = [12, 24] as const;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 100;
/** Trùng MAX_LIST_ITEMS của backend: mỗi bộ lọc danh sách tối đa 30 giá trị. */
export const MAX_FILTER_VALUES = 30;

export interface ProductFilters {
  q?: string;
  brand: string[];
  origin: string[];
  roast: RoastLevel[];
  process: CoffeeProcess[];
  brew: BrewMethod[];
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  sort?: ProductSort;
  page: number;
  pageSize: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const EMPTY_FILTERS: ProductFilters = {
  brand: [],
  origin: [],
  roast: [],
  process: [],
  brew: [],
  inStock: false,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Gộp nhiều tham số lặp / giá trị cách nhau dấu phẩy thành danh sách (không trùng). */
function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const item of arr) {
    for (const part of item.split(",")) {
      const t = part.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

function enumList<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T[] {
  return list(v)
    .filter((x): x is T => (allowed as readonly string[]).includes(x))
    .slice(0, MAX_FILTER_VALUES);
}

function nonNegInt(v: string | string[] | undefined): number | undefined {
  const s = first(v)?.trim();
  if (!s || !/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Chuẩn hóa mọi searchParams thành bộ lọc hợp lệ; giá trị sai bị bỏ để không gửi query sai lên API. */
export function parseFilters(sp: RawSearchParams): ProductFilters {
  const q = first(sp.q)?.trim().slice(0, MAX_QUERY_LENGTH).trim();

  let minPrice = nonNegInt(sp.minPrice);
  let maxPrice = nonNegInt(sp.maxPrice);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    minPrice = undefined;
    maxPrice = undefined;
  }

  const rawSort = first(sp.sort)?.trim() ?? "";
  let sort = (SORT_VALUES as string[]).includes(rawSort) ? (rawSort as ProductSort) : undefined;
  if (sort === "relevance" && !q) sort = undefined;

  const pageNum = nonNegInt(sp.page);
  const pageSizeNum = nonNegInt(sp.pageSize);

  return {
    q: q || undefined,
    brand: list(sp.brand)
      .filter((s) => /^[a-z0-9-]{1,100}$/.test(s))
      .slice(0, MAX_FILTER_VALUES),
    origin: list(sp.origin)
      .filter((s) => s.length <= 60)
      .slice(0, MAX_FILTER_VALUES),
    roast: enumList(sp.roast, ROAST_VALUES),
    process: enumList(sp.process, PROCESS_VALUES),
    brew: enumList(sp.brew, BREW_VALUES),
    minPrice,
    maxPrice,
    inStock: first(sp.inStock) === "true",
    sort,
    page: pageNum && pageNum >= 1 ? pageNum : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeNum ?? 0)
      ? (pageSizeNum as number)
      : DEFAULT_PAGE_SIZE,
  };
}

/** Sắp xếp mặc định: relevance khi có q, ngược lại newest. */
export function defaultSort(filters: Pick<ProductFilters, "q">): ProductSort {
  return filters.q ? "relevance" : "newest";
}

export function effectiveSort(filters: ProductFilters): ProductSort {
  return filters.sort ?? defaultSort(filters);
}

export type ApiQuery = Record<string, string | number | boolean | undefined>;

/** Query gửi lên GET /products. Chỉ chứa giá trị hợp lệ. */
export function toApiQuery(filters: ProductFilters, categorySlug?: string): ApiQuery {
  return {
    q: filters.q,
    category: categorySlug,
    brand: filters.brand.length ? filters.brand.join(",") : undefined,
    origin: filters.origin.length ? filters.origin.join(",") : undefined,
    roast: filters.roast.length ? filters.roast.join(",") : undefined,
    process: filters.process.length ? filters.process.join(",") : undefined,
    brew: filters.brew.length ? filters.brew.join(",") : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    inStock: filters.inStock ? true : undefined,
    sort: filters.sort && filters.sort !== defaultSort(filters) ? filters.sort : undefined,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** Dựng query string cho URL trang (bỏ giá trị mặc định). */
export function toSearchParams(filters: ProductFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.brand.length) p.set("brand", filters.brand.join(","));
  if (filters.origin.length) p.set("origin", filters.origin.join(","));
  if (filters.roast.length) p.set("roast", filters.roast.join(","));
  if (filters.process.length) p.set("process", filters.process.join(","));
  if (filters.brew.length) p.set("brew", filters.brew.join(","));
  if (filters.minPrice !== undefined) p.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) p.set("maxPrice", String(filters.maxPrice));
  if (filters.inStock) p.set("inStock", "true");
  if (filters.sort && filters.sort !== defaultSort(filters)) p.set("sort", filters.sort);
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) p.set("pageSize", String(filters.pageSize));
  if (filters.page > 1) p.set("page", String(filters.page));
  return p;
}

export function buildHref(pathname: string, filters: ProductFilters): string {
  const qs = toSearchParams(filters).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Đổi bộ lọc/sắp xếp: luôn quay về trang 1. */
export function changeFilters(
  filters: ProductFilters,
  patch: Partial<ProductFilters>,
): ProductFilters {
  return { ...filters, ...patch, page: 1 };
}

/** Xóa mọi bộ lọc nhưng giữ từ khóa tìm kiếm, sắp xếp và cỡ trang. */
export function clearFilters(filters: ProductFilters): ProductFilters {
  return { ...EMPTY_FILTERS, q: filters.q, sort: filters.sort, pageSize: filters.pageSize };
}

/** Có bộ lọc nào đang bật (không tính q, sort, page)? */
export function hasActiveFilters(f: ProductFilters): boolean {
  return (
    f.brand.length > 0 ||
    f.origin.length > 0 ||
    f.roast.length > 0 ||
    f.process.length > 0 ||
    f.brew.length > 0 ||
    f.minPrice !== undefined ||
    f.maxPrice !== undefined ||
    f.inStock
  );
}
