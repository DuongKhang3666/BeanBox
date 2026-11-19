import type { MyReview, MyReviewState, Review, ReviewSummary } from "@/types/review";

export function makeReview(over: Partial<Review> = {}): Review {
  return {
    id: "r1",
    rating: 5,
    content: "Thơm, hậu ngọt.",
    authorName: "An N. V.",
    verifiedPurchase: true,
    createdAt: "2026-11-11T03:00:00.000Z",
    updatedAt: "2026-11-11T03:00:00.000Z",
    reply: null,
    repliedAt: null,
    ...over,
  };
}

export function makeMyReview(over: Partial<MyReview> = {}): MyReview {
  return { ...makeReview({ id: "mine" }), status: "PUBLISHED", images: [], ...over };
}

export function makeSummary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    ratingAvg: 4.6,
    ratingCount: 18,
    distribution: { "1": 0, "2": 1, "3": 1, "4": 4, "5": 12 },
    ...over,
  };
}

export function makeMine(over: Partial<MyReviewState> = {}): MyReviewState {
  return { canReview: true, reason: null, review: null, canEdit: false, ...over };
}

export function listBody(
  reviews: Review[],
  over: { summary?: ReviewSummary; page?: number; totalPages?: number; total?: number } = {},
) {
  return {
    data: reviews,
    meta: {
      page: over.page ?? 1,
      pageSize: 10,
      total: over.total ?? reviews.length,
      totalPages: over.totalPages ?? 1,
      summary: over.summary ?? makeSummary(),
    },
  };
}
