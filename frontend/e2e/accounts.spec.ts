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
  const { code, phone } = await createGuestCodOrder(request, product.variantId);

  await login(page, "staff@beanbox.local", seedPassword("STAFF"));

  // Khu Phân tích kinh doanh chỉ Admin: STAFF không thấy menu, vào thẳng URL bị báo không đủ quyền
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Quản trị" });
  await expect(nav.getByRole("link", { name: "Đơn hàng" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Phân tích" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Xem phân tích chi tiết" })).toHaveCount(0);
  await page.goto("/admin/phan-tich");
  await expect(page.getByText("Bạn không đủ quyền xem phân tích kinh doanh")).toBeVisible();
  await expect(page.getByRole("region", { name: "Doanh thu", exact: true })).toHaveCount(0);

  await page.goto("/admin/don-hang");
  await page.getByRole("link", { name: code }).first().click();
  await expect(page.getByRole("heading", { name: `Đơn hàng ${code}` })).toBeVisible();

  // Xác nhận
  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  const confirmDlg = page.getByRole("dialog", { name: "Xác nhận đơn" });
  await confirmDlg.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expect(confirmDlg).toBeHidden();
  await expect(page.getByText("Đã xác nhận").first()).toBeVisible();

  // D-062: đóng gói -> giao cho vận chuyển KHÔNG nhập mã -> hệ thống tạo mã vận đơn giả lập
  await page.getByRole("button", { name: "Bắt đầu đóng gói" }).click();
  const packDlg = page.getByRole("dialog", { name: "Bắt đầu đóng gói" });
  await packDlg.getByRole("button", { name: "Bắt đầu đóng gói" }).click();
  await expect(packDlg).toBeHidden();
  await page.getByRole("button", { name: "Giao cho vận chuyển" }).click();
  const shipDlg = page.getByRole("dialog", { name: "Giao cho vận chuyển" });
  await expect(shipDlg.getByText("Để trống để hệ thống tạo mã vận đơn giả lập.")).toBeVisible();
  await shipDlg.getByRole("button", { name: "Giao cho vận chuyển" }).click();
  await expect(shipDlg).toBeHidden();
  await expect(page.getByText(/BBL-\d{8}-[A-Z2-9]{6}/).first()).toBeVisible();
  await expect(page.getByText("BeanBox Logistics (giả lập)").first()).toBeVisible();

  // Khách tra cứu (không cần đăng nhập) thấy mã vận đơn giả lập và mốc "Đã bàn giao..."
  await page.goto(`/tra-cuu-don-hang`);
  await page.getByLabel("Mã đơn hàng").fill(code);
  await page.getByLabel("Số điện thoại đặt hàng").fill(phone);
  await page.getByRole("button", { name: "Tra cứu" }).click();
  const result = page.getByRole("region", { name: "Kết quả tra cứu" });
  await expect(result.getByText(/BBL-\d{8}-[A-Z2-9]{6}/)).toBeVisible();
  await expect(result.getByText("Đã bàn giao cho đơn vị vận chuyển")).toBeVisible();
  await expect(result.getByText(/Hành trình mô phỏng \(giả lập\)/)).toBeVisible();

  // Dọn dẹp: giao thất bại -> hủy đơn để hoàn kho
  await page.goto("/admin/don-hang");
  await page.getByRole("link", { name: code }).first().click();
  await page.getByRole("button", { name: "Giao thất bại" }).click();
  const failDlg = page.getByRole("dialog", { name: "Giao thất bại" });
  await failDlg.getByLabel(/Lý do/).fill("Dọn dẹp sau kiểm thử E2E");
  await failDlg.getByRole("button", { name: "Giao thất bại" }).click();
  await expect(failDlg).toBeHidden();
  await page.getByRole("button", { name: "Hủy đơn" }).click();
  const cancelDlg = page.getByRole("dialog", { name: "Hủy đơn" });
  await cancelDlg.getByLabel(/Ghi chú/).fill("Dọn dẹp sau kiểm thử E2E");
  await cancelDlg.getByRole("button", { name: "Hủy đơn" }).click();
  await expect(cancelDlg).toBeHidden();
  await expect(page.getByText("Đã hủy").first()).toBeVisible();
});
