import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login, seedPassword } from "./helpers";

test.describe.configure({ mode: "serial" });

// Chuỗi chữ thường + số, đủ dài để tìm đúng tin nhắn của lượt chạy này.
const token = randomBytes(5).toString("hex");
const senderEmail = `e2e-${token}@example.com`;

test("khách gửi form liên hệ và thấy lời cảm ơn", async ({ page }) => {
  await page.goto("/lien-he");
  const form = page.getByRole("form", { name: "Biểu mẫu liên hệ" });
  await form.getByLabel("Họ và tên").fill("Khách Kiểm Thử E2E");
  await form.getByLabel("Email", { exact: true }).fill(senderEmail);
  await form.getByLabel("Nội dung").fill(`Tin nhắn kiểm thử tự động ${token}, vui lòng bỏ qua.`);
  await form.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText(/Cảm ơn bạn! BeanBox đã nhận được tin nhắn/)).toBeVisible();
});

test("admin xử lý tin nhắn, xem cài đặt và người dùng", async ({ page }) => {
  await login(page, "admin@beanbox.local", seedPassword("ADMIN"));

  // Liên hệ: tìm, mở chi tiết, đổi trạng thái, lưu
  await page.goto("/admin/lien-he");
  await page.getByLabel("Tìm theo tên, email, tiêu đề hoặc nội dung").fill(token);
  const row = page.getByRole("row", { name: new RegExp(token) });
  await expect(row).toBeVisible();
  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/lien-he\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Nội dung" })).toBeVisible();
  await expect(page.getByText(`Tin nhắn kiểm thử tự động ${token}`)).toBeVisible();
  await page.getByLabel("Trạng thái", { exact: true }).selectOption({ label: "Đã xử lý" });
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã lưu thay đổi.")).toBeVisible();

  // Cài đặt: chỉ xem, không lưu
  await page.goto("/admin/cai-dat");
  await expect(page.getByRole("heading", { name: "Cài đặt cửa hàng" })).toBeVisible();
  for (const title of [
    "Phí vận chuyển",
    "Khu vực nội thành",
    "Thông tin liên hệ",
    "Banner trang chủ",
  ]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }

  // Người dùng: thấy customer seed; chi tiết chính mình có ghi chú không thể tự khóa
  await page.goto("/admin/nguoi-dung");
  await page.getByLabel("Tìm theo email, họ tên hoặc SĐT").fill("customer@beanbox.local");
  await expect(page.getByRole("row", { name: /customer@beanbox\.local/ })).toBeVisible();
  await page.getByLabel("Tìm theo email, họ tên hoặc SĐT").fill("admin@beanbox.local");
  const adminRow = page.getByRole("row", { name: /admin@beanbox\.local/ });
  await expect(adminRow).toBeVisible();
  await adminRow.getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/nguoi-dung\/[^/?]+$/);
  await expect(page.getByText("Bạn không thể khóa hoặc đổi vai trò của chính mình.")).toBeVisible();
});

test("chính sách vận chuyển hiển thị phí và trang chủ có CSP report-only và CSP thực thi", async ({
  page,
}) => {
  await page.goto("/chinh-sach/van-chuyen");
  await expect(page.getByText(/Tiêu chuẩn/).first()).toBeVisible();

  const res = await page.request.get("/");
  expect(res.status()).toBe(200);
  const reportOnly = res.headers()["content-security-policy-report-only"];
  expect(reportOnly).toContain("default-src 'self'");
  expect(reportOnly).toContain("https://challenges.cloudflare.com");
  expect(reportOnly).toContain("frame-src 'self' https://challenges.cloudflare.com");
  expect(res.headers()["content-security-policy"]).toBe(
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
});
