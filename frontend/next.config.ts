import type { NextConfig } from "next";
import { buildCspEnforced, buildCspReportOnly } from "./src/lib/csp";

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
    // CSP đầy đủ ở report-only (D-024); header thực thi chỉ là tập con không cần nonce (D-032).
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: buildCspReportOnly(process.env.NODE_ENV !== "production"),
          },
          { key: "Content-Security-Policy", value: buildCspEnforced() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
