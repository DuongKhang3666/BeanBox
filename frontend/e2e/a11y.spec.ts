import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API, findStockedProduct, login, seedPassword } from "./helpers";

/**
 * Quét khả năng truy cập (WCAG 2.1 A/AA) cho storefront bằng axe-core.
 * FAIL khi có vi phạm impact `serious`/`critical`; `moderate`/`minor` chỉ in ra console (D-044).
 * Tổng cộng 1 lượt đăng nhập customer (rate limit đăng nhập 5/phút/IP).
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["serious", "critical"]);
const CATEGORY = "ca-phe-hat";
const CART_TOKEN_KEY = "bb_cart_token"; // khớp src/lib/api/client.ts

async function scan(page: Page, label: string) {
  // Chờ font/ảnh và hydrate xong để kết quả ổn định.
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const describe = (v: (typeof violations)[number]) =>
    `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nút) ` +
    v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(" "))
      .join(" | ");

  const soft = violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  for (const v of soft) console.log(`a11y ${label}: ${describe(v)}`);

  const hard = violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  expect(hard.map(describe), `Vi phạm a11y nghiêm trọng ở ${label}`).toEqual([]);
}

async function seedCartToken(page: Page, variantId: string) {
  const res = await page.request.post(`${API}/cart/items`, { data: { variantId, quantity: 1 } });
  expect(res.status()).toBeLessThan(300);
  const token = res.headers()["x-cart-token"];
  expect(token).toBeTruthy();
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [CART_TOKEN_KEY, token!],
  );
}

test.describe("a11y: trang công khai", () => {
  let productSlug = "";
  let variantId = "";

  test.beforeAll(async ({ request }) => {
    const p = await findStockedProduct(request, CATEGORY);
    productSlug = p.slug;
    variantId = p.variantId;
  });

  const staticPages: [string, string][] = [
    ["trang chủ", "/"],
    ["danh mục", `/danh-muc/${CATEGORY}`],
    ["tìm kiếm", "/tim-kiem?q=phin"],
    ["giỏ hàng trống", "/gio-hang"],
    ["đăng nhập", "/dang-nhap"],
    ["đăng ký", "/dang-ky"],
    ["quên mật khẩu", "/quen-mat-khau"],
    ["tra cứu đơn hàng", "/tra-cuu-don-hang"],
    ["liên hệ", "/lien-he"],
    ["chính sách vận chuyển", "/chinh-sach/van-chuyen"],
    ["giới thiệu", "/gioi-thieu"],
    ["404", "/trang-khong-ton-tai-a11y"],
  ];

  for (const [label, url] of staticPages) {
    test(label, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("main")).toBeVisible();
      await scan(page, url);
    });
  }

  test("chi tiết sản phẩm", async ({ page }) => {
    await page.goto(`/san-pham/${productSlug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, `/san-pham/${productSlug}`);
  });

  test("so sánh sản phẩm (2 sản phẩm)", async ({ request, page }) => {
    const res = await request.get(`${API}/products?category=${CATEGORY}&pageSize=2`);
    const slugs = ((await res.json()) as { data: { slug: string }[] }).data.map((p) => p.slug);
    expect(slugs).toHaveLength(2);
    const url = `/so-sanh?sp=${slugs.join(",")}`;
    await page.goto(url);
    await expect(page.getByRole("table")).toBeVisible();
    await scan(page, url);
  });

  test("thanh so sánh cố định (đã chọn 2 sản phẩm)", async ({ page }) => {
    const entries = ["a", "b"].map((s) => ({
      slug: `sp-${s}`,
      name: `Sản phẩm ${s}`,
      imageUrl: null,
      categoryName: null,
    }));
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      ["bb_compare_v1", JSON.stringify(entries)],
    );
    await page.goto(`/danh-muc/${CATEGORY}`);
    await expect(page.getByRole("complementary", { name: "So sánh sản phẩm" })).toBeVisible();
    await scan(page, "/danh-muc (có thanh so sánh)");
  });

  test("giỏ hàng có hàng", async ({ page }) => {
    await seedCartToken(page, variantId);
    await page.goto("/gio-hang");
    await expect(page.getByRole("link", { name: /Thanh toán|Tiến hành/ }).first()).toBeVisible();
    await scan(page, "/gio-hang (có hàng)");
  });

  test("thanh toán có hàng", async ({ page }) => {
    await seedCartToken(page, variantId);
    await page.goto("/thanh-toan");
    await expect(page.getByLabel("Email")).toBeVisible();
    await scan(page, "/thanh-toan");
  });
});

test("a11y: tài khoản customer", async ({ page }) => {
  await login(page, "customer@beanbox.local", seedPassword("CUSTOMER"));
  await page.goto("/tai-khoan");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "/tai-khoan");
  await page.goto("/tai-khoan/don-hang");
  await expect(page.getByRole("heading", { name: /Đơn hàng/ }).first()).toBeVisible();
  await scan(page, "/tai-khoan/don-hang");
});
