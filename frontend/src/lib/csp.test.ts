import { describe, expect, it } from "vitest";
import { buildCspAdmin, buildCspStorefront, generateNonce } from "./csp";

describe("buildCspStorefront", () => {
  it("production: chuỗi đầy đủ khớp contract §14.12", () => {
    expect(buildCspStorefront(false)).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report",
    );
  });

  it("development: thêm 'unsafe-eval' vào script-src", () => {
    const v = buildCspStorefront(true);
    expect(v).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com 'unsafe-eval';",
    );
    expect(buildCspStorefront(false)).not.toContain("'unsafe-eval'");
  });
});

describe("buildCspAdmin", () => {
  const nonce = "dGVzdG5vbmNlMTIzNA==";

  it("production: chuỗi đầy đủ", () => {
    expect(buildCspAdmin(false, nonce)).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report`,
    );
  });

  it("script-src không có 'unsafe-inline' và không có Turnstile (frame-src có)", () => {
    const v = buildCspAdmin(false, nonce);
    const script = v.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("challenges.cloudflare.com");
    expect(v).not.toContain("'unsafe-eval'");
  });

  it("development thêm 'unsafe-eval'", () => {
    expect(buildCspAdmin(true, nonce)).toContain("'strict-dynamic' 'unsafe-eval';");
  });
});

describe("generateNonce", () => {
  it("base64 của 16 byte (24 ký tự) và khác nhau mỗi lần", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const n = generateNonce();
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      set.add(n);
    }
    expect(set.size).toBe(50);
  });
});
