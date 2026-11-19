/** Kiểu theo docs/api-contract.md §14.1. */
import type { PaginationMeta } from "./api";

export type ReviewStatus = "PUBLISHED" | "HIDDEN";
export type ReviewSort = "newest" | "highest" | "lowest";
export type ReviewDenyReason = "NOT_PURCHASED" | "ALREADY_REVIEWED";

export interface Review {
  id: string;
  rating: number;
  content: string;
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  reply: string | null;
  repliedAt: string | null;
}

export interface MyReview extends Review {
  status: ReviewStatus;
  images: unknown[];
}

export interface ReviewSummary {
  ratingAvg: number;
  ratingCount: number;
  /** Đủ 5 khóa "1".."5". */
  distribution: Record<string, number>;
}

export interface ReviewsMeta extends PaginationMeta {
  summary: ReviewSummary;
}

export interface MyReviewState {
  canReview: boolean;
  reason: ReviewDenyReason | null;
  review: MyReview | null;
  canEdit: boolean;
}

export interface ReviewInput {
  rating: number;
  content: string;
}
