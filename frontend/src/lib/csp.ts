/** CSP chế độ report-only (D-024). Hàm thuần để next.config.ts và test dùng chung. */
export function buildCspReportOnly(isDev: boolean): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/v1/csp-report",
  ].join("; ");
}
