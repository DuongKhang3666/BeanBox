import { api } from "@/lib/api/client";
import type { AdminReview, AdminReviewQuery, ReviewStatus } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";

const enc = encodeURIComponent;

/** GET /admin/reviews (§14.1). Staff+. */
export async function listAdminReviews(query: AdminReviewQuery, signal?: AbortSignal) {
  const { hasReply, ...rest } = query;
  const { data, meta } = await api.get<AdminReview[], Partial<PaginationMeta>>("/admin/reviews", {
    query: { ...rest, hasReply: hasReply === undefined ? undefined : String(hasReply) },
    signal,
  });
  return {
    data,
    meta: {
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      total: meta?.total ?? data.length,
      totalPages: meta?.totalPages ?? 1,
    } satisfies PaginationMeta,
  };
}

export async function setReviewStatus(id: string, status: ReviewStatus): Promise<AdminReview> {
  const { data } = await api.patch<AdminReview>(`/admin/reviews/${enc(id)}`, { status });
  return data;
}

/** 1-1000 ký tự (đã trim); ghi đè câu trả lời cũ. */
export async function replyToReview(id: string, reply: string): Promise<AdminReview> {
  const { data } = await api.put<AdminReview>(`/admin/reviews/${enc(id)}/reply`, { reply });
  return data;
}

export async function deleteReviewReply(id: string): Promise<AdminReview> {
  const { data } = await api.delete<AdminReview>(`/admin/reviews/${enc(id)}/reply`);
  return data;
}
