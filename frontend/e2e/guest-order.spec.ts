import { expect, test } from "@playwright/test";
import { findStockedProduct, testContact } from "./helpers";

test("khách vãng lai: mua COD, tra cứu và hủy đơn", async ({ page, request }) => {
  const product = await findStockedProduct(request);
  const contact = testContact();

  // Trang chủ -> danh mục
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Danh mục chính" })
    .getByRole("link", { name: "Cà phê hạt" })
    .click();
  await expect(page).toHaveURL(/\/danh-muc\/ca-phe-hat/);

  // Mở sản phẩm còn hàng (đã chọn qua API; nếu không nằm trang đầu thì vào thẳng)
  const link = page.locator(`main a[href="/san-pham/${product.slug}"]`).first();
  if (await link.count()) await link.click();
  else await page.goto(`/san-pham/${product.slug}`);
  await expect(page).toHaveURL(new RegExp(`/san-pham/${product.slug}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name);

  // Thêm vào giỏ -> mini-cart mở, ảnh không tràn ngang
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
  const mini = page.getByRole("dialog", { name: "Giỏ hàng của bạn" });
  await expect(mini).toBeVisible();
  await expect(mini.getByText(product.name)).toBeVisible();
  const img = mini.locator("img").first();
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(80);

  // Giỏ -> thanh toán
  await mini.getByRole("link", { name: "Xem giỏ hàng" }).click();
  await expect(page).toHaveURL(/\/gio-hang/);
  await page
    .getByRole("link", { name: /Thanh toán|Tiến hành/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/thanh-toan/);

  // Form thanh toán: liên hệ + địa chỉ TP.HCM
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

  // Phí ship được tính -> chọn COD
  await expect(page.getByRole("radio", { name: /tiêu chuẩn/i }).first()).toBeChecked();
  await page.getByRole("radio", { name: /thanh toán khi nhận hàng|COD/i }).check();

  await page.getByLabel(/Tôi đã đọc và đồng ý/).check();
  await page.getByRole("button", { name: /^Đặt hàng/ }).click();

  // Trang thành công có mã đơn
  await expect(page).toHaveURL(/\/dat-hang-thanh-cong\/BB-/);
  const code = /\/dat-hang-thanh-cong\/([^/?#]+)/.exec(page.url())![1]!;
  await expect(page.getByText(code).first()).toBeVisible();

  // Tra cứu với mã + SĐT
  await page.goto("/tra-cuu-don-hang");
  await page.getByLabel("Mã đơn hàng").fill(code);
  await page.getByLabel("Số điện thoại đặt hàng").fill(contact.phone);
  await page.getByRole("button", { name: "Tra cứu" }).click();
  const result = page.getByRole("region", { name: "Kết quả tra cứu" });
  await expect(result.getByText(code)).toBeVisible();

  // Hủy đơn
  await result.getByRole("button", { name: "Hủy đơn" }).click();
  await page
    .getByRole("dialog", { name: new RegExp(`Hủy đơn hàng ${code}`) })
    .getByRole("button", { name: "Xác nhận hủy đơn" })
    .click();
  await expect(result.getByText("Đã hủy").first()).toBeVisible();
});
