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
const FRONTEND_URL = EXTERNAL_BASE_URL ?? "http://localhost:3000";
const BACKEND_HEALTH = "http://127.0.0.1:4000/api/v1/health";

export default defineConfig({
  forbidOnly: IS_CI,
  testDir: "./e2e",
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
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
      },
    },
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
          env: { JOBS_ENABLED: "false", GENERAL_RATE_LIMIT_PER_MIN: "1000" },
        },
        {
          command: "npm run dev",
          cwd: __dirname,
          url: FRONTEND_URL,
          reuseExistingServer: !IS_CI,
          timeout: 180_000,
        },
      ],
});
