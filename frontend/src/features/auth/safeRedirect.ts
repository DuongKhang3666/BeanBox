export const DEFAULT_AFTER_LOGIN = "/tai-khoan";

/**
 * Chống open redirect: chỉ nhận đường dẫn nội bộ dạng "/xxx".
 * Từ chối "//host", "/\\host", URL tuyệt đối, "javascript:", ký tự điều khiển.
 */
export function safeRedirect(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000)
    return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  if (next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(next)) return DEFAULT_AFTER_LOGIN;
  return next;
}
