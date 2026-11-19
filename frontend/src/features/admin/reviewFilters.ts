import type { AdminReviewQuery, ReviewStatus } from "@/types/admin";

export const REVIEWS_BASE = "/admin/danh-gia";

const ID_RE = /^[a-z0-9]{1,50}$/;

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PUBLISHED: "Đang hiển thị",
  HIDDEN: "Đã ẩn",
};

export function parseReviewFilters(params: URLSearchParams): AdminReviewQuery {
  const status = params.get("status");
  const rating = Number(params.get("rating"));
  const productId = params.get("productId");
  const hasReply = params.get("hasReply");
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const pageNum = Number(params.get("page"));
  const out: AdminReviewQuery = {
    status: status === "PUBLISHED" || status === "HIDDEN" ? status : undefined,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    productId: productId && ID_RE.test(productId) ? productId : undefined,
    hasReply: hasReply === "true" ? true : hasReply === "false" ? false : undefined,
    q: q || undefined,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AdminReviewQuery;
}

export function reviewsHref(f: AdminReviewQuery): string {
  const qs = new URLSearchParams();
  if (f.status) qs.set("status", f.status);
  if (f.rating) qs.set("rating", String(f.rating));
  if (f.productId) qs.set("productId", f.productId);
  if (f.hasReply !== undefined) qs.set("hasReply", String(f.hasReply));
  if (f.q) qs.set("q", f.q);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${REVIEWS_BASE}?${s}` : REVIEWS_BASE;
}
