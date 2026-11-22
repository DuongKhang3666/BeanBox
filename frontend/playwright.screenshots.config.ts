import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Chụp ảnh màn hình cho README (docs/screenshots). KHÔNG phải E2E, không chạy trong CI.
 * Hướng dẫn đầy đủ: docs/screenshots/README.md. Chạy: `npm run screenshots`.
 *
 * AN TOÀN (bắt buộc):
 * - Script tạo đơn hàng demo và đổi trạng thái đơn, nên CHỈ chạy trên một DB tạm vừa migrate + seed.
 *   Bắt buộc biến SCREENSHOT_DATABASE_URL; thiếu, trùng DATABASE_URL trong backend/.env, hoặc trỏ
 *   localhost/127.0.0.1:5432 (DB dev) thì ném lỗi và không chạy. Không bao giờ in URL ra log.
 * - Cổng riêng (mặc định API 4100, web 3100; đổi bằng SHOTS_API_PORT / SHOTS_WEB_PORT) và
 *   reuseExistingServer: false, nên cổng bận thì Playwright báo lỗi thay vì dùng nhầm server dev.
 * - Frontend chạy BẢN PRODUCTION (next build + next start) để ảnh không có chỉ báo dev của Next.
 *   Bước build chạy trong webServer (sau khi backend sẵn sàng, vì trang tĩnh gọi API lúc build),
 *   mất khoảng 1-3 phút; timeout webServer đã đặt đủ rộng.
 */
const BACKEND_DIR = path.resolve(__dirname, "../backend");

function readBackendEnv(): Record<string, string> {
  let text = "";
  try {
    text = readFileSync(path.join(BACKEND_DIR, ".env"), "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Mật khẩu seed: ưu tiên biến môi trường, thiếu thì đọc backend/.env (không hardcode, không in). */
const backendEnv = readBackendEnv();
for (const key of ["SEED_ADMIN_PASSWORD", "SEED_STAFF_PASSWORD", "SEED_CUSTOMER_PASSWORD"]) {
  if (!process.env[key] && backendEnv[key]) process.env[key] = backendEnv[key];
}

function endpoint(url: string): { host: string; port: string; db: string } | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
      port: u.port || "5432",
      db: u.pathname,
    };
  } catch {
    return null;
  }
}

function resolveDatabaseUrl(): string {
  const url = process.env.SCREENSHOT_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Thiếu SCREENSHOT_DATABASE_URL. Script chụp ảnh chỉ chạy trên DB tạm (xem docs/screenshots/README.md).",
    );
  }
  const target = endpoint(url);
  if (!target) throw new Error("SCREENSHOT_DATABASE_URL không phải URL hợp lệ.");
  const devUrls = [backendEnv.DATABASE_URL, process.env.DATABASE_URL].filter(
    (v): v is string => !!v,
  );
  for (const dev of devUrls) {
    const d = endpoint(dev);
    if (
      dev === url ||
      (d && d.host === target.host && d.port === target.port && d.db === target.db)
    ) {
      throw new Error("SCREENSHOT_DATABASE_URL trùng DATABASE_URL (DB dev). Dùng DB tạm riêng.");
    }
  }
  const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(target.host);
  if (local && target.port === "5432") {
    throw new Error(
      "SCREENSHOT_DATABASE_URL trỏ cổng 5432 trên máy này (DB dev). Dùng DB tạm ở cổng khác, ví dụ 55434.",
    );
  }
  return url;
}

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} phải là số cổng hợp lệ (1-65535), nhận được: ${raw}`);
  }
  return n;
}

const DATABASE_URL = resolveDatabaseUrl();
const API_PORT = portFromEnv("SHOTS_API_PORT", 4100);
const WEB_PORT = portFromEnv("SHOTS_WEB_PORT", 3100);
if (API_PORT === 4000 || WEB_PORT === 3000) {
  throw new Error("Không dùng cổng 4000/3000 (dành cho server dev). Chọn cổng khác.");
}

// e2e/helpers.ts đọc E2E_API_PORT lúc import; worker kế thừa env của tiến trình này.
process.env.E2E_API_PORT = String(API_PORT);

const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./scripts/screenshots",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: path.resolve(__dirname, "node_modules/.cache/screenshots-results"),
  use: {
    baseURL: WEB_URL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "screenshots",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 900 },
        // Máy này dùng E2E_BROWSER_CHANNEL=msedge (Application Control chặn Chromium tải về).
        ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx src/server.ts",
      cwd: BACKEND_DIR,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "development",
        DATABASE_URL,
        PORT: String(API_PORT),
        FRONTEND_ORIGINS: WEB_URL,
        WEB_APP_URL: WEB_URL,
        JOBS_ENABLED: "false",
        GENERAL_RATE_LIMIT_PER_MIN: "1000",
        AUTH_RATE_LIMIT_PER_MIN: "30",
        ORDER_RATE_LIMIT_PER_MIN: "200",
        COUPON_RATE_LIMIT_PER_MIN: "200",
        QUOTE_RATE_LIMIT_PER_MIN: "200",
        // Email gửi nền và chỉ log khi lỗi: trỏ cổng không có dịch vụ để không gửi đi đâu
        // (kể cả Mailpit dev ở 1025).
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "9",
        // Cổng thanh toán giả + chuyển khoản VietQR demo + 2FA (D-060, D-061, D-063). Khóa 2FA là khóa
        // dev ASCII dựng lúc chạy (32 byte, chỉ dùng cho DB tạm); production từ chối khóa dạng `beanbox-dev-`.
        PAYMENT_MOCKS_ENABLED: "true",
        BANK_TRANSFER_ENABLED: "true",
        TOTP_ENCRYPTION_KEY: Buffer.from("beanbox-dev-totp-key-screenshots").toString("base64"),
        // Không dùng nhà cung cấp thật dù backend/.env có khai báo: xóa khỏi env của backend ảnh.
        VNPAY_TMN_CODE: "",
        VNPAY_HASH_SECRET: "",
        VNPAY_RETURN_URL: "",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
      },
    },
    {
      command: `npm run build && npx next start -p ${WEB_PORT}`,
      cwd: __dirname,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 600_000,
      env: {
        NODE_ENV: "production",
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
        NEXT_PUBLIC_SITE_URL: WEB_URL,
      },
    },
  ],
});
