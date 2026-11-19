import { describe, expect, it } from "vitest";
import { buildCspReportOnly } from "./csp";

describe("buildCspReportOnly", () => {
  it("có đủ directive và report-uri", () => {
    const v = buildCspReportOnly(false);
    for (const d of [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "report-uri /api/v1/csp-report",
    ]) {
      expect(v).toContain(d);
    }
  });

  it("production không có 'unsafe-eval'", () => {
    const v = buildCspReportOnly(false);
    expect(v).toContain("script-src 'self' 'unsafe-inline';");
    expect(v).not.toContain("'unsafe-eval'");
  });

  it("development thêm 'unsafe-eval' vào script-src", () => {
    expect(buildCspReportOnly(true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
  });
});
