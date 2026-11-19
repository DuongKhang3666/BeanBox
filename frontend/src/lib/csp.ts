/**
 * CSP THỰC THI (D-024, D-032, D-035 và quyết định M8). Hàm thuần để next.config.ts, proxy.ts và test dùng chung.
 * - Storefront: không nonce (giữ static/ISR), script-src còn 'unsafe-inline' vì script của Next chứa payload RSC.
 * - Admin: nonce theo request + 'strict-dynamic', không 'unsafe-inline' cho script (xem src/proxy.ts).
 */

const REPORT_URI = "report-uri /api/v1/csp-report";

function common(frameSrc: string): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-src ${frameSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    REPORT_URI,
  ];
}

/** CSP cho mọi route trừ /admin. */
export function buildCspStorefront(isDev: boolean): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`;
  const [defaultSrc, ...rest] = common("'self' https://challenges.cloudflare.com");
  return [defaultSrc, scriptSrc, ...rest].join("; ");
}

/** CSP cho /admin: nonce theo request; script-src không có Turnstile (chỉ frame-src). */
export function buildCspAdmin(isDev: boolean, nonce: string): string {
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`;
  const [defaultSrc, ...rest] = common("'self' https://challenges.cloudflare.com");
  return [defaultSrc, scriptSrc, ...rest].join("; ");
}

/** Nonce 16 byte ngẫu nhiên (Web Crypto, chạy được ở runtime của proxy), base64. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
