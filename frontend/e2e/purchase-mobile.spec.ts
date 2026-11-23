import { expect, test, type Page } from "@playwright/test";
import {
  addToCartWhenReady,
  cancelGuestOrderApi,
  findStockedProduct,
  testContact,
} from "./helpers";

/**
 * Luồng mua trên màn hình 390 px (D-083). Chạy ở project `mobile-390` (Chromium) và
 * `webkit-smoke` (iPhone 13, WebKit). Không đăng nhập (không tốn lượt limiter auth). Đơn tạo ra
 * được hủy qua API ở cuối để hoàn kho.
 */

async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    m.scroll,
    `${where}: scrollWidth ${m.scroll} > clientWidth ${m.client}`,
  ).toBeLessThanOrEqual(m.client);
}

test("mobile: duyệt danh mục, thêm giỏ, checkout COD, trang thành công", async ({
  page,
  request,
}) => {
  const product = await findStockedProduct(request);
  const contact = testContact();
  let orderCode = "";

  try {
    await page.goto("/");
    await expectNoHorizontalOverflow(page, "trang chủ");

    // Menu "Danh mục" của header mobile (nút có thể chưa hydrate: lặp tới khi mở được).
    const menuButton = page.getByRole("button", { name: "Danh mục", exact: true });
    await expect(async () => {
      if ((await menuButton.getAttribute("aria-expanded")) !== "true") await menuButton.click();
      await expect(menuButton).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass();
    await page
      .getByRole("navigation", { name: "Danh mục sản phẩm" })
      .getByRole("link", { name: "Cà phê hạt" })
      .click();
    await expect(page).toHaveURL(/\/danh-muc\/ca-phe-hat/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, "danh mục");

    // Sản phẩm còn hàng (chọn qua API; không nằm trang đầu thì vào thẳng)
    const link = page.locator(`main a[href="/san-pham/${product.slug}"]`).first();
    if (await link.count()) await link.click();
    else await page.goto(`/san-pham/${product.slug}`);
    await expect(page).toHaveURL(new RegExp(`/san-pham/${product.slug}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name);
    await expectNoHorizontalOverflow(page, "chi tiết sản phẩm");

    // Thêm vào giỏ -> mini-cart (ngăn kéo) mở
    await addToCartWhenReady(page);
    const mini = page.getByRole("dialog", { name: "Giỏ hàng của bạn" });
    await expect(mini).toBeVisible();
    await expect(mini.getByText(product.name)).toBeVisible();
    await mini.getByRole("link", { name: "Xem giỏ hàng" }).click();
    await expect(page).toHaveURL(/\/gio-hang/);
    await expectNoHorizontalOverflow(page, "giỏ hàng");
    await page
      .getByRole("link", { name: /Thanh toán|Tiến hành/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/thanh-toan/);

    // Form thanh toán, địa chỉ TP.HCM
    await page.getByLabel("Email").fill(contact.email);
    await page.getByLabel("Số điện thoại", { exact: true }).fill(contact.phone);
    await page.getByLabel("Họ và tên người nhận").fill("Nguyễn Kiểm Thử");
    await page.getByLabel("Số điện thoại người nhận").fill(contact.phone);
    await page.getByRole("combobox", { name: "Tỉnh/thành" }).click();
    await page.getByRole("option", { name: /Hồ Chí Minh/ }).click();
    const ward = page.getByRole("combobox", { name: "Phường/xã" });
    await expect(ward).toBeEnabled();
    await ward.click();
    await page.getByRole("option", { name: "Phường Sài Gòn", exact: true }).click();
    await page.getByLabel("Địa chỉ cụ thể (số nhà, đường)").fill("12 Lê Lợi");
    await expect(page.getByRole("radio", { name: /tiêu chuẩn/i }).first()).toBeChecked();
    await page.getByRole("radio", { name: /thanh toán khi nhận hàng|COD/i }).check();
    await page.getByLabel(/Tôi đã đọc và đồng ý/).check();
    await expectNoHorizontalOverflow(page, "thanh toán");
    await page.getByRole("button", { name: /^Đặt hàng/ }).click();

    // Trang thành công
    await expect(page).toHaveURL(/\/dat-hang-thanh-cong\/BB-/);
    orderCode = /\/dat-hang-thanh-cong\/([^/?#]+)/.exec(page.url())![1]!;
    await expect(page.getByText(orderCode).first()).toBeVisible();
    await expect(page.getByText("Dự kiến giao", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "trang thành công");
  } finally {
    if (orderCode) await cancelGuestOrderApi(request, orderCode, contact.phone);
  }
});
