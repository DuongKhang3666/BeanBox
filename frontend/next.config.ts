import type { NextConfig } from "next";
import { buildCspStorefront } from "./src/lib/csp";

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

function backendImagePattern() {
  try {
    const u = new URL(apiInternalUrl);
    return {
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      port: u.port,
      pathname: "/uploads/**",
    };
  } catch {
    return null;
  }
}

const backendPattern = backendImagePattern();

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiInternalUrl}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${apiInternalUrl}/uploads/:path*` },
    ];
  },
  async headers() {
    // Header an toàn cho mọi route. Đặt TRƯỚC các rule riêng bên dưới vì khi trùng key, rule sau
    // thắng (Referrer-Policy: no-referrer ở trang có token/chữ ký trên URL).
    // CSP storefront thực thi cho mọi route TRỪ /admin (admin có CSP nonce riêng, đặt ở src/proxy.ts).
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Mọi route trừ /admin và /admin/...; không loại nhầm route khác bắt đầu bằng "admin".
        source: "/((?!admin(?:/|$)).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildCspStorefront(process.env.NODE_ENV !== "production"),
          },
        ],
      },
      // Token reset/verify nằm trên URL: không gửi Referer sang trang khác.
      {
        source: "/dat-lai-mat-khau",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // Query chứa chữ ký/phiên thanh toán của cổng (VNPay, Stripe).
        source: "/thanh-toan/ket-qua",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/xac-thuc-email",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  images: {
    remotePatterns: backendPattern ? [backendPattern] : [],
    // Ảnh tải lên cũng truy cập được same-origin qua /uploads (rewrites)
    localPatterns: [{ pathname: "/uploads/**" }, { pathname: "/**" }],
  },
};

export default nextConfig;
