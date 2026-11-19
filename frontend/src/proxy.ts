import { NextResponse, type NextRequest } from "next/server";
import { buildCspAdmin, generateNonce } from "@/lib/csp";

/**
 * Chỉ chạy cho /admin: sinh nonce, đặt CSP thực thi (có nonce + 'strict-dynamic').
 * Next đọc nonce từ header CSP của REQUEST để gắn vào script của nó khi render động.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCspAdmin(process.env.NODE_ENV !== "production", nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
