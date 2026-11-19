import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E cục bộ (chưa chạy trong CI, D-020). Cần Postgres dev đã migrate + seed.
 * Mật khẩu tài khoản seed đọc từ backend/.env (SEED_*_PASSWORD), không hardcode, không in ra.
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

const FRONTEND_URL = "http://localhost:3000";
const BACKEND_HEALTH = "http://127.0.0.1:4000/api/v1/health";

export default defineConfig({
  testDir: "./e2e",
  workers: 1, // rate limit đăng nhập 5/phút/IP
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
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
  webServer: [
    {
      command: "npm run dev",
      cwd: BACKEND_DIR,
      url: BACKEND_HEALTH,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { JOBS_ENABLED: "false" },
    },
    {
      command: "npm run dev",
      cwd: __dirname,
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
