/** URL thanh toán do server dựng; FE chỉ chuyển hướng khi là https (chống open redirect/downgrade). */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Chuyển tới cổng thanh toán. Trả false (không chuyển) nếu URL không phải https. */
export function goToPayment(url: unknown): boolean {
  if (!isHttpsUrl(url)) return false;
  window.location.assign(url);
  return true;
}
