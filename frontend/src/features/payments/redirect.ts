/** Đường dẫn trang cổng thanh toán GIẢ của chính FE (D-060). */
export const MOCK_GATEWAY_PREFIX = "/cong-thanh-toan-gia-lap/";
const RESULT_PATH = "/thanh-toan/ket-qua";

/** URL thanh toán do server dựng; FE chỉ chuyển hướng khi là https (chống open redirect/downgrade). */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Trang cổng giả cùng origin với FE (http cục bộ được phép CHỈ cho đường dẫn này). */
export function isMockGatewayUrl(value: unknown, origin: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.origin === origin && u.pathname.startsWith(MOCK_GATEWAY_PREFIX);
  } catch {
    return false;
  }
}

/** Chuyển tới cổng thanh toán. Trả false (không chuyển) nếu URL không phải https hoặc trang cổng giả cùng origin. */
export function goToPayment(url: unknown): boolean {
  if (!isHttpsUrl(url) && !isMockGatewayUrl(url, window.location.origin)) return false;
  window.location.assign(url as string);
  return true;
}

/**
 * URL trang kết quả do cổng giả trả về: chỉ chấp nhận cùng origin và đúng đường dẫn kết quả.
 * Trả đường dẫn tương đối (path + query) để điều hướng nội bộ; không hợp lệ -> null.
 */
export function safeResultPath(value: unknown, origin: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.origin !== origin || u.pathname !== RESULT_PATH) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
