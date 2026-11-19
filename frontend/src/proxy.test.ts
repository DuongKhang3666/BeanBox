import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function run() {
  return proxy(new NextRequest("http://localhost:3000/admin/san-pham"));
}

describe("proxy (admin CSP)", () => {
  it("response có đúng một CSP admin chứa nonce và strict-dynamic", () => {
    const csp = run().headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]{22}==' 'strict-dynamic'/);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("challenges.cloudflare.com");
  });

  it("chuyển tiếp x-nonce và CSP vào request header, khớp nonce với response", () => {
    const res = run();
    const csp = res.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    // NextResponse.next({ request }) đặt header request ghi đè dưới tiền tố x-middleware-request-
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("nonce khác nhau giữa các request", () => {
    const a = /'nonce-([^']+)'/.exec(run().headers.get("content-security-policy")!)![1];
    const b = /'nonce-([^']+)'/.exec(run().headers.get("content-security-policy")!)![1];
    expect(a).not.toBe(b);
  });

  it("matcher chỉ /admin và /admin/*", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
  });
});
