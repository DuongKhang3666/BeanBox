/** Header CSP THỰC THI, tập con không cần nonce (D-032). */
export function buildCspEnforced(): string {
  return "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
}

/** CSP chế độ report-only (D-024, D-028). Hàm thuần để next.config.ts và test dùng chung. */
export function buildCspReportOnly(isDev: boolean): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/v1/csp-report",
  ].join("; ");
}
