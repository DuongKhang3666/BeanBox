import { api } from "@/lib/api/client";
import type {
  MyReview,
  MyReviewState,
  Review,
  ReviewInput,
  ReviewSort,
  ReviewsMeta,
} from "@/types/review";

export const REVIEWS_PAGE_SIZE = 10;

export interface ListReviewsParams {
  /** Lọc theo số sao (1-5); null = tất cả. */
  rating?: number | null;
  sort?: ReviewSort;
  page?: number;
  pageSize?: number;
}

const base = (slug: string) => `/products/${encodeURIComponent(slug)}/reviews`;

/** Public: không gửi Bearer để token hết hạn không làm hỏng danh sách. */
export async function listReviews(
  slug: string,
  params: ListReviewsParams = {},
  signal?: AbortSignal,
): Promise<{ data: Review[]; meta: ReviewsMeta }> {
  const { data, meta } = await api.get<Review[], ReviewsMeta>(base(slug), {
    query: {
      rating: params.rating ?? undefined,
      sort: params.sort,
      page: params.page,
      pageSize: params.pageSize ?? REVIEWS_PAGE_SIZE,
    },
    skipAuth: true,
    signal,
  });
  if (!meta) throw new Error("Thiếu meta trong phản hồi danh sách đánh giá");
  return { data, meta };
}

export async function getMyReview(slug: string): Promise<MyReviewState> {
  const { data } = await api.get<MyReviewState>(`${base(slug)}/me`);
  return data;
}

export async function createReview(slug: string, input: ReviewInput): Promise<MyReview> {
  const { data } = await api.post<MyReview>(base(slug), input);
  return data;
}

export async function updateReview(id: string, input: Partial<ReviewInput>): Promise<MyReview> {
  const { data } = await api.patch<MyReview>(`/reviews/${encodeURIComponent(id)}`, input);
  return data;
}
