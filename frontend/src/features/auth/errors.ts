import { ApiError } from "@/lib/api/errors";

export interface MappedError {
  /** Lỗi chung của form (hiển thị role="alert" phía trên nút gửi). */
  formError?: string;
  /** Lỗi theo field (hiển thị dưới ô nhập). */
  fieldErrors: Record<string, string>;
}

const TZ = "Asia/Ho_Chi_Minh";

/** "HH:mm dd/MM/yyyy" theo giờ Việt Nam. Trả null nếu không parse được. */
export function formatLockedUntil(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}/${get("year")}`;
}

function detailsObject(details: unknown): Record<string, unknown> | null {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null;
}

/**
 * Map lỗi API sang lỗi hiển thị cho form.
 * @param knownFields các field của form; lỗi field khác (vd header) sẽ được gộp vào lỗi chung.
 */
export function mapAuthError(error: unknown, knownFields?: readonly string[]): MappedError {
  if (!(error instanceof ApiError)) {
    return { formError: "Đã có lỗi xảy ra. Vui lòng thử lại.", fieldErrors: {} };
  }

  switch (error.code) {
    case "VALIDATION_ERROR": {
      const fieldErrors: Record<string, string> = {};
      const extra: string[] = [];
      if (Array.isArray(error.details)) {
        for (const d of error.details as Array<{ field?: unknown; message?: unknown }>) {
          if (typeof d?.field !== "string" || typeof d?.message !== "string") continue;
          if (knownFields && !knownFields.includes(d.field)) extra.push(d.message);
          else if (!(d.field in fieldErrors)) fieldErrors[d.field] = d.message;
        }
      }
      if (extra.length > 0) return { formError: extra[0], fieldErrors };
      if (Object.keys(fieldErrors).length === 0) {
        return { formError: error.message || "Dữ liệu không hợp lệ", fieldErrors };
      }
      return { fieldErrors };
    }
    case "INVALID_CREDENTIALS":
      return { formError: "Email hoặc mật khẩu không đúng", fieldErrors: {} };
    case "ACCOUNT_LOCKED": {
      const until = formatLockedUntil(detailsObject(error.details)?.lockedUntil);
      return {
        formError: until
          ? `Tài khoản tạm khóa đến ${until}`
          : "Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.",
        fieldErrors: {},
      };
    }
    case "ACCOUNT_DISABLED":
      return {
        formError: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ cửa hàng để được hỗ trợ.",
        fieldErrors: {},
      };
    case "EMAIL_TAKEN":
      return { fieldErrors: { email: "Email đã được sử dụng" } };
    case "RATE_LIMITED": {
      const sec = Number(detailsObject(error.details)?.retryAfterSec);
      return {
        formError:
          Number.isFinite(sec) && sec > 0
            ? `Bạn thao tác quá nhanh. Thử lại sau ${Math.ceil(sec)} giây.`
            : "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
        fieldErrors: {},
      };
    }
    case "NETWORK_ERROR":
      return {
        formError: "Không thể kết nối tới máy chủ. Kiểm tra mạng và thử lại.",
        fieldErrors: {},
      };
    default:
      return { formError: error.message || "Đã có lỗi xảy ra. Vui lòng thử lại.", fieldErrors: {} };
  }
}
