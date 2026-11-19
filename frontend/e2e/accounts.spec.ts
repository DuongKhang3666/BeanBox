import { expect, test } from "@playwright/test";
import { createGuestCodOrder, findStockedProduct, login, seedPassword } from "./helpers";

test.describe.configure({ mode: "serial" });

test("customer: xem đơn hàng, bị chặn ở khu quản trị, đăng xuất", async ({ page }) => {
  // Gộp để tiết kiệm lượt đăng nhập (rate limit 5/phút/IP)
  await login(page, "customer@beanbox.local", seedPassword("CUSTOMER"));
  await page.goto("/tai-khoan/don-hang");
  await expect(page).toHaveURL(/\/tai-khoan\/don-hang/);
  await expect(page.getByRole("heading", { name: /Đơn hàng/ }).first()).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByText("Bạn không có quyền truy cập khu quản trị")).toBeVisible();

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("staff: xác nhận đơn COD của khách rồi hủy để hoàn kho", async ({ page, request }) => {
  const product = await findStockedProduct(request);
  const { code } = await createGuestCodOrder(request, product.variantId);

  await login(page, "staff@beanbox.local", seedPassword("STAFF"));
  await page.goto("/admin/don-hang");
  await page.getByRole("link", { name: code }).first().click();
  await expect(page.getByRole("heading", { name: `Đơn hàng ${code}` })).toBeVisible();

  // Xác nhận
  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  const confirmDlg = page.getByRole("dialog", { name: "Xác nhận đơn" });
  await confirmDlg.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expect(confirmDlg).toBeHidden();
  await expect(page.getByText("Đã xác nhận").first()).toBeVisible();

  // Dọn dẹp: hủy đơn để hoàn kho
  await page.getByRole("button", { name: "Hủy đơn" }).click();
  const cancelDlg = page.getByRole("dialog", { name: "Hủy đơn" });
  await cancelDlg.getByLabel(/Ghi chú/).fill("Dọn dẹp sau kiểm thử E2E");
  await cancelDlg.getByRole("button", { name: "Hủy đơn" }).click();
  await expect(cancelDlg).toBeHidden();
  await expect(page.getByText("Đã hủy").first()).toBeVisible();
});
