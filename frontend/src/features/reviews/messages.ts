import { ApiError } from "@/lib/api/errors";

export const REVIEW_MAX_LENGTH = 2000;

export const NOT_PURCHASED_MESSAGE = "Chỉ khách đã nhận hàng mới đánh giá được.";
export const EDIT_EXPIRED_MESSAGE =
  "Đã quá 30 ngày kể từ lúc đăng nên bạn không thể sửa đánh giá này nữa.";
export const ALREADY_REVIEWED_MESSAGE = "Bạn đã đánh giá sản phẩm này rồi.";

function reasonOf(err: ApiError): string | null {
  const d = err.details;
  if (typeof d === "object" && d !== null && "reason" in d) {
    const r = (d as { reason?: unknown }).reason;
    return typeof r === "string" ? r : null;
  }
  return null;
}

/** Thông báo tiếng Việt cho lỗi gửi/sửa đánh giá. */
export function reviewErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  switch (err.code) {
    case "REVIEW_NOT_ALLOWED":
      return reasonOf(err) === "ALREADY_REVIEWED"
        ? ALREADY_REVIEWED_MESSAGE
        : NOT_PURCHASED_MESSAGE;
    case "REVIEW_EDIT_EXPIRED":
      return EDIT_EXPIRED_MESSAGE;
    case "RATE_LIMITED": {
      const d = err.details as { retryAfterSec?: unknown } | undefined;
      const sec = typeof d?.retryAfterSec === "number" ? Math.ceil(d.retryAfterSec) : null;
      return sec
        ? `Bạn gửi đánh giá quá nhanh. Vui lòng thử lại sau ${sec} giây.`
        : "Bạn gửi đánh giá quá nhanh. Vui lòng thử lại sau ít phút.";
    }
    case "VALIDATION_ERROR":
      return "Nội dung đánh giá chưa hợp lệ. Vui lòng kiểm tra lại số sao và nội dung.";
    case "NOT_FOUND":
      return "Không tìm thấy sản phẩm hoặc đánh giá này.";
    case "NETWORK_ERROR":
      return "Không thể kết nối tới máy chủ. Vui lòng thử lại.";
    default:
      return "Chưa gửi được đánh giá. Vui lòng thử lại.";
  }
}

/** Lỗi nghiệp vụ làm thay đổi quyền viết/sửa: cần tải lại trạng thái "của tôi". */
export function isReviewStateError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "REVIEW_NOT_ALLOWED" || err.code === "REVIEW_EDIT_EXPIRED")
  );
}

export interface ReviewFormValues {
  rating: number;
  content: string;
}

export interface ReviewFormErrors {
  rating?: string;
  content?: string;
}

export function validateReview(v: ReviewFormValues): ReviewFormErrors {
  const errors: ReviewFormErrors = {};
  if (!Number.isInteger(v.rating) || v.rating < 1 || v.rating > 5) {
    errors.rating = "Vui lòng chọn số sao từ 1 đến 5.";
  }
  if (v.content.trim().length > REVIEW_MAX_LENGTH) {
    errors.content = `Nội dung tối đa ${REVIEW_MAX_LENGTH} ký tự.`;
  }
  return errors;
}
