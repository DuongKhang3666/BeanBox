import type { AdminProductQuery, AdminProductSort, AdminProductStatus } from "@/types/admin";

export const PRODUCTS_BASE = "/admin/san-pham";
export const ALL_PRODUCT_STATUSES: AdminProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

const ID_RE = /^[a-z0-9]{1,50}$/;

export function parseProductFilters(params: URLSearchParams): AdminProductQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const set = new Set((params.get("status") ?? "").split(","));
  const statuses = ALL_PRODUCT_STATUSES.filter((s) => set.has(s));
  const sort = params.get("sort");
  const categoryId = params.get("categoryId");
  const brandId = params.get("brandId");
  const pageNum = Number(params.get("page"));
  const out: AdminProductQuery = {
    q: q || undefined,
    status: statuses.length ? statuses : undefined,
    categoryId: categoryId && ID_RE.test(categoryId) ? categoryId : undefined,
    brandId: brandId && ID_RE.test(brandId) ? brandId : undefined,
    deleted: params.get("deleted") === "true" ? true : undefined,
    sort: sort === "updated" || sort === "name" ? (sort as AdminProductSort) : undefined,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AdminProductQuery;
}

export function productsHref(f: AdminProductQuery): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.status?.length) qs.set("status", f.status.join(","));
  if (f.categoryId) qs.set("categoryId", f.categoryId);
  if (f.brandId) qs.set("brandId", f.brandId);
  if (f.deleted) qs.set("deleted", "true");
  if (f.sort === "updated" || f.sort === "name") qs.set("sort", f.sort);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${PRODUCTS_BASE}?${s}` : PRODUCTS_BASE;
}
