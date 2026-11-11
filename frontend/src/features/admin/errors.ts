import { ApiError } from "@/lib/api/errors";
import type { FieldErrorDetail } from "@/types/api";

/** Lỗi API admin -> câu tiếng Việt cho người dùng. */
export function adminErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  switch (err.code) {
    case "FORBIDDEN":
      return "Bạn không đủ quyền thực hiện thao tác này.";
    case "ACCOUNT_DISABLED":
      return "Tài khoản của bạn đã bị khóa.";
    case "UNAUTHORIZED":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case "NOT_FOUND":
      return "Không tìm thấy dữ liệu.";
    case "CONFLICT":
      return "Đơn hàng vừa được cập nhật, vui lòng tải lại.";
    case "INVALID_STATUS_TRANSITION":
      return "Không thể chuyển đơn sang trạng thái này. Đơn hàng có thể vừa được cập nhật.";
    case "VALIDATION_ERROR":
      return "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.";
    case "RATE_LIMITED":
      return "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.";
    case "NETWORK_ERROR":
      return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    default:
      return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  }
}

/** details[] của VALIDATION_ERROR -> map field -> message (lấy lỗi đầu tiên mỗi field). */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_ERROR") return out;
  if (!Array.isArray(err.details)) return out;
  for (const d of err.details as Partial<FieldErrorDetail>[]) {
    if (d && typeof d.field === "string" && typeof d.message === "string" && !(d.field in out)) {
      out[d.field] = d.message;
    }
  }
  return out;
}
