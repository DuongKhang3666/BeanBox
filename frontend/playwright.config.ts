import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E cục bộ và trong CI (D-033). Cần Postgres đã migrate + seed.
 * Mật khẩu tài khoản seed: ưu tiên biến môi trường (CI), nếu thiếu thì đọc từ backend/.env
 * (SEED_*_PASSWORD), không hardcode, không in ra.
 */
const BACKEND_DIR = path.resolve(__dirname, "../backend");

function loadSeedPasswords(): void {
  let text = "";
  try {
    text = readFileSync(path.join(BACKEND_DIR, ".env"), "utf8");
  } catch {
    return; // thiếu .env: test sẽ tự báo thiếu mật khẩu
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(SEED_(?:ADMIN|STAFF|CUSTOMER)_PASSWORD)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    if (value && !process.env[key]) process.env[key] = value;
  }
}
loadSeedPasswords();

const IS_CI = !!process.env.CI;

// E2E_BASE_URL: chạy spec với một bản đã dựng sẵn (ví dụ production qua docker compose ở
// https://localhost:8443): không khởi động webServer, bỏ qua lỗi chứng chỉ tự ký.
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL;

// Cách ly cổng (tùy chọn): khi cổng 4000/3000 đã bị một backend/frontend dev khác chiếm, đặt
// E2E_API_PORT / E2E_WEB_PORT (ví dụ 4100 / 3100) để Playwright tự khởi động cặp server riêng
// với env E2E đúng mà không đụng tiến trình đang chạy. Mặc định giữ nguyên 4000/3000.
function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} phải là số cổng hợp lệ (1-65535), nhận được: ${raw}`);
  }
  return n;
}
const API_PORT = portFromEnv("E2E_API_PORT", 4000);
const WEB_PORT = portFromEnv("E2E_WEB_PORT", 3000);
const CUSTOM_API_PORT = API_PORT !== 4000;
const CUSTOM_WEB_PORT = WEB_PORT !== 3000;

const FRONTEND_URL = EXTERNAL_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const BACKEND_HEALTH = `http://127.0.0.1:${API_PORT}/api/v1/health`;

const PURCHASE_SPEC = /purchase-mobile\.spec\.ts$/;
const channelUse = process.env.E2E_BROWSER_CHANNEL
  ? { channel: process.env.E2E_BROWSER_CHANNEL }
  : {};
const SKIP_WEBKIT =
  process.env.E2E_SKIP_WEBKIT === "1" ||
  (process.env.E2E_SKIP_WEBKIT !== "0" && !!process.env.E2E_BROWSER_CHANNEL);

export default defineConfig({
  forbidOnly: IS_CI,
  testDir: "./e2e",
  // Khởi động nguội: làm nóng route/rewrite của Next dev trước khi chạy test (D-083).
  globalSetup: "./e2e/global-setup.ts",
  workers: 1, // rate limit đăng nhập 5/phút/IP
  fullyParallel: false,
  retries: IS_CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: IS_CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    ...(EXTERNAL_BASE_URL ? { ignoreHTTPSErrors: true } : {}),
    locale: "vi-VN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Mặc định dùng Chromium của Playwright. Máy bị chặn chạy file tải về (Application Control)
  // thì đặt E2E_BROWSER_CHANNEL=msedge (hoặc chrome) để dùng trình duyệt Chromium đã cài sẵn.
  // D-083: chromium = desktop, toàn bộ spec trừ spec luồng mua mobile; mobile-390 và webkit-smoke
  // chỉ chạy spec luồng mua (purchase-mobile.spec.ts).
  projects: [
    {
      name: "chromium",
      testIgnore: PURCHASE_SPEC,
      use: { ...devices["Desktop Chrome"], ...channelUse },
    },
    {
      name: "mobile-390",
      testMatch: PURCHASE_SPEC,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        ...channelUse,
      },
    },
    // WebKit chỉ khi có trình duyệt: bỏ qua mặc định khi dùng kênh Edge/Chrome có sẵn (máy
    // chặn file tải về), hoặc khi E2E_SKIP_WEBKIT=1; ép bật bằng E2E_SKIP_WEBKIT=0.
    ...(SKIP_WEBKIT
      ? []
      : [
          {
            name: "webkit-smoke",
            testMatch: PURCHASE_SPEC,
            use: { ...devices["iPhone 13"] },
          },
        ]),
  ],
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : [
        {
          command: "npm run dev",
          cwd: BACKEND_DIR,
          url: BACKEND_HEALTH,
          reuseExistingServer: !IS_CI,
          timeout: 120_000,
          env: {
            JOBS_ENABLED: "false",
            GENERAL_RATE_LIMIT_PER_MIN: "1000",
            // Nhiều project cùng đặt đơn từ một IP: nới limiter đặt đơn/mã/quote như CI (ưu tiên env).
            ORDER_RATE_LIMIT_PER_MIN: process.env.ORDER_RATE_LIMIT_PER_MIN ?? "200",
            COUPON_RATE_LIMIT_PER_MIN: process.env.COUPON_RATE_LIMIT_PER_MIN ?? "200",
            QUOTE_RATE_LIMIT_PER_MIN: process.env.QUOTE_RATE_LIMIT_PER_MIN ?? "200",
            // Limiter nhóm auth (login/register/...) mặc định 5/phút; E2E có ~5 lượt đăng nhập.
            AUTH_RATE_LIMIT_PER_MIN: "30",
            // D-063: khóa AES-256 giả cho secret 2FA (32 byte ASCII; chỉ dev/E2E, production từ chối).
            // Ưu tiên giá trị từ môi trường (CI), nếu không có thì dùng khóa mẫu dev của .env.example.
            TOTP_ENCRYPTION_KEY:
              process.env.TOTP_ENCRYPTION_KEY ?? "YmVhbmJveC1kZXYtdG90cC1rZXktbG9jYWxob3N0ISE=",
            // D-060/D-061: cổng giả + chuyển khoản VietQR demo (chỉ dev/CI; production từ chối).
            PAYMENT_MOCKS_ENABLED: "true",
            BANK_TRANSFER_ENABLED: "true",
            // Chỉ ghi đè khi đổi cổng (mặc định dùng giá trị trong backend/.env như trước).
            ...(CUSTOM_API_PORT ? { PORT: String(API_PORT) } : {}),
            ...(CUSTOM_WEB_PORT
              ? {
                  FRONTEND_ORIGINS: `http://localhost:${WEB_PORT}`,
                  WEB_APP_URL: `http://localhost:${WEB_PORT}`,
                }
              : {}),
          },
        },
        {
          command: CUSTOM_WEB_PORT ? `npx next dev -p ${WEB_PORT}` : "npm run dev",
          cwd: __dirname,
          // Chờ qua rewrite của Next (không chỉ trang chủ) nên chứng minh proxy tới backend hoạt động.
          url: `${FRONTEND_URL}/api/v1/health`,
          reuseExistingServer: !IS_CI,
          timeout: 180_000,
          // next.config.ts (rewrites) và lib/api/server (SSR) đọc API_INTERNAL_URL.
          ...(CUSTOM_API_PORT ? { env: { API_INTERNAL_URL: `http://localhost:${API_PORT}` } } : {}),
        },
      ],
});
