import type { NextConfig } from "next";

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
  images: {
    remotePatterns: backendPattern ? [backendPattern] : [],
    // Ảnh tải lên cũng truy cập được same-origin qua /uploads (rewrites)
    localPatterns: [{ pathname: "/uploads/**" }, { pathname: "/**" }],
  },
};

export default nextConfig;
