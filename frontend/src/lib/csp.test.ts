import { describe, expect, it } from "vitest";
import { buildCspEnforced, buildCspReportOnly } from "./csp";

describe("buildCspReportOnly", () => {
  it("có đủ directive và report-uri", () => {
    const v = buildCspReportOnly(false);
    for (const d of [
      "default-src 'self'",
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
    ]) {
      expect(v).toContain(d);
    }
  });

  it("production không có 'unsafe-eval'", () => {
    const v = buildCspReportOnly(false);
    expect(v).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;");
    expect(v).not.toContain("'unsafe-eval'");
  });

  it("development thêm 'unsafe-eval' vào script-src", () => {
    expect(buildCspReportOnly(true)).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com 'unsafe-eval';",
    );
  });
});

describe("buildCspReportOnly khớp contract §14.12 (production)", () => {
  it("chuỗi đầy đủ", () => {
    expect(buildCspReportOnly(false)).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report",
    );
  });
});

describe("buildCspEnforced", () => {
  it("chỉ tập con không cần nonce (D-032)", () => {
    expect(buildCspEnforced()).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  });
});
