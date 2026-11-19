import { expect, test, type Page } from "@playwright/test";
import { login, seedPassword } from "./helpers";

/**
 * M8: CSP thực thi không được làm vỡ trang nào. Mỗi bước phải có 0 vi phạm CSP và trang tương tác được.
 * Chỉ đăng nhập admin 1 lần (rate limit 5/phút).
 */
test.describe.configure({ mode: "serial" });

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

const consoleCsp: string[] = [];

async function violations(page: Page): Promise<string[]> {
  const fromEvents = await page.evaluate(() => window.__cspViolations ?? []);
  return [...fromEvents, ...consoleCsp];
}

async function expectNoViolations(page: Page, step: string) {
  expect(await violations(page), `vi phạm CSP ở bước: ${step}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  consoleCsp.length = 0;
  await page.addInitScript(() => {
    window.__cspViolations = window.__cspViolations ?? [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations!.push(
        `${e.effectiveDirective} blocked=${e.blockedURI} @${e.documentURI}`,
      );
    });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && /content security policy/i.test(msg.text())) {
      consoleCsp.push(msg.text());
    }
  });
});

test("header CSP: storefront và admin", async ({ page }) => {
  const home = await page.request.get("/");
  expect(home.headers()["content-security-policy"]).toContain("script-src 'self' 'unsafe-inline'");
  expect(home.headers()["content-security-policy-report-only"]).toBeUndefined();
});

test("storefront: không vi phạm CSP và trang tương tác được", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoViolations(page, "trang chủ");

  await page.goto("/danh-muc/ca-phe-hat");
  const card = page.locator('a[href^="/san-pham/"]').first();
  await expect(card).toBeVisible();
  await expectNoViolations(page, "danh sách sản phẩm");

  await Promise.all([page.waitForURL(/\/san-pham\/[^/?]+$/), card.click()]);
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoViolations(page, "chi tiết sản phẩm");

  await page.goto("/gio-hang");
  await expect(page.getByRole("heading", { name: "Giỏ hàng", exact: true })).toBeVisible();
  await expectNoViolations(page, "giỏ hàng");

  await page.goto("/dang-nhap");
  const email = page.getByLabel("Email", { exact: true });
  await email.fill("khong-ton-tai@example.com"); // field client hoạt động
  await expect(email).toHaveValue("khong-ton-tai@example.com");
  await expectNoViolations(page, "đăng nhập");

  await page.goto("/lien-he");
  const name = page.getByLabel("Họ và tên");
  await name.fill("Kiểm thử CSP");
  await expect(name).toHaveValue("Kiểm thử CSP");
  await expectNoViolations(page, "liên hệ");

  await page.goto("/tra-cuu-don-hang");
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoViolations(page, "tra cứu đơn hàng");
});

test("admin: CSP nonce, không vi phạm, trang tương tác được", async ({ page }) => {
  await login(page, "admin@beanbox.local", seedPassword("ADMIN"));
  await expectNoViolations(page, "đăng nhập admin");

  const res = await page.goto("/admin");
  const csp = res!.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src ")) ?? "";
  expect(scriptSrc).not.toContain("challenges.cloudflare.com");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(res!.headers()["content-security-policy-report-only"]).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expectNoViolations(page, "dashboard admin");

  await page.goto("/admin/san-pham");
  await expect(page.getByRole("heading", { name: "Sản phẩm" })).toBeVisible();
  await expectNoViolations(page, "danh sách sản phẩm admin");

  const detail = page.locator('a[href^="/admin/san-pham/"]:not([href$="/moi"])').first();
  await expect(detail).toBeVisible();
  await Promise.all([page.waitForURL(/\/admin\/san-pham\/[^/?]+$/), detail.click()]);
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoViolations(page, "chi tiết sản phẩm admin");
});
