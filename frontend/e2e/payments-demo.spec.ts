import { expect, test, type Page } from "@playwright/test";
import {
  addToCartWhenReady,
  cancelGuestOrderApi,
  findStockedProduct,
  testContact,
  type StockedProduct,
} from "./helpers";

/**
 * Thanh toán GIẢ LẬP cho demo (D-060, D-061). Cần backend chạy với PAYMENT_MOCKS_ENABLED=true
 * và BANK_TRANSFER_ENABLED=true (playwright.config.ts và job e2e trong CI đã đặt).
 * Không có tiền thật, không gọi dịch vụ ngoài.
 */

async function checkoutAs(
  page: Page,
  product: StockedProduct,
  contact: { email: string; phone: string },
  method: RegExp,
) {
  await page.goto(`/san-pham/${product.slug}`);
  await addToCartWhenReady(page);
  await expect(page.getByRole("dialog", { name: "Giỏ hàng của bạn" })).toBeVisible();
  await page.goto("/thanh-toan");

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

  const radio = page.getByRole("radio", { name: method });
  await expect(radio).toBeEnabled();
  await radio.check();
  await page.getByLabel(/Tôi đã đọc và đồng ý/).check();
  await page.getByRole("button", { name: /^Đặt hàng/ }).click();
}

test.describe("thanh toán giả lập", () => {
  test("VNPay giả lập: cổng giả -> Thanh toán thành công", async ({ page, request }) => {
    const product = await findStockedProduct(request);
    await checkoutAs(page, product, testContact(), /VNPay/);

    await expect(page).toHaveURL(/\/cong-thanh-toan-gia-lap\/vnpay/);
    await expect(page.getByRole("note")).toContainText("GIẢ LẬP, không trừ tiền thật");
    await expect(page.getByTestId("mock-order-code")).toContainText("BB-");
    await page.getByRole("button", { name: "Thanh toán thành công" }).click();

    await expect(page).toHaveURL(/\/thanh-toan\/ket-qua/);
    await expect(page.getByRole("heading", { name: "Thanh toán thành công" })).toBeVisible();
  });

  test("MoMo giả lập: cổng giả -> Thanh toán thành công", async ({ page, request }) => {
    const product = await findStockedProduct(request);
    await checkoutAs(page, product, testContact(), /MoMo/);

    await expect(page).toHaveURL(/\/cong-thanh-toan-gia-lap\/momo/);
    await expect(page.getByRole("note")).toContainText("GIẢ LẬP, không trừ tiền thật");
    await page.getByRole("button", { name: "Thanh toán thành công" }).click();

    await expect(page).toHaveURL(/\/thanh-toan\/ket-qua/);
    await expect(page.getByRole("heading", { name: "Thanh toán thành công" })).toBeVisible();
  });

  test("VNPay giả lập: Hủy giao dịch -> không báo thành công", async ({ page, request }) => {
    const product = await findStockedProduct(request);
    await checkoutAs(page, product, testContact(), /VNPay/);
    await expect(page).toHaveURL(/\/cong-thanh-toan-gia-lap\/vnpay/);
    await page.getByRole("button", { name: "Hủy giao dịch" }).click();
    await expect(page).toHaveURL(/\/thanh-toan\/ket-qua/);
    await expect(page.getByRole("heading", { name: "Thanh toán thành công" })).toHaveCount(0);
  });

  test("chuyển khoản: hiện QR + cảnh báo demo; 'Tôi đã chuyển khoản' chưa đổi sang đã thanh toán", async ({
    page,
    request,
  }) => {
    const product = await findStockedProduct(request);
    const contact = testContact();
    await checkoutAs(page, product, contact, /Chuyển khoản/);

    await expect(page).toHaveURL(/\/dat-hang-thanh-cong\/BB-/);
    const code = /\/dat-hang-thanh-cong\/([^/?#]+)/.exec(page.url())![1]!;
    await expect(page.getByRole("note")).toContainText("KHÔNG chuyển tiền thật");
    const qr = page.getByRole("img", { name: /Mã QR VietQR/ });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(page.getByTestId("bt-content")).toContainText(code);

    await page.getByRole("button", { name: "Tôi đã chuyển khoản" }).click();
    await expect(page.getByTestId("bt-claimed")).toBeVisible();
    // Khách tự báo không làm đơn thành "đã thanh toán".
    await page.goto("/tra-cuu-don-hang");
    await page.getByLabel("Mã đơn hàng").fill(code);
    await page.getByLabel("Số điện thoại đặt hàng").fill(contact.phone);
    await page.getByRole("button", { name: "Tra cứu" }).click();
    const result = page.getByRole("region", { name: "Kết quả tra cứu" });
    await expect(result.getByText(code)).toBeVisible();
    await expect(result.getByText("Chờ thanh toán").first()).toBeVisible();

    await cancelGuestOrderApi(request, code, contact.phone);
  });
});
