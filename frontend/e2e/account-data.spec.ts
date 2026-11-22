import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { API, login, randomDigits } from "./helpers";

/**
 * D-065: khách tải dữ liệu cá nhân và tự xóa tài khoản.
 * Dùng một CUSTOMER tạo riêng (đăng ký qua API), KHÔNG đụng tài khoản seed.
 * Lượt tính vào limiter auth (AUTH_RATE_LIMIT_PER_MIN=30): đăng ký API 1 + đăng nhập UI 1 +
 * đăng nhập lại sau khi xóa 1 = 3.
 */

const PASSWORD = "Matkhau65Xoa";

test("khách tải dữ liệu JSON rồi tự xóa tài khoản, không đăng nhập lại được", async ({
  page,
  request,
}) => {
  const email = `e2e-xoa-${randomDigits(8)}@example.com`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { fullName: "Khách Sắp Xóa", email, password: PASSWORD },
  });
  expect(reg.status(), "register").toBe(201);

  await login(page, email, PASSWORD);
  await page.goto("/tai-khoan");
  const section = page.getByRole("region", { name: "Dữ liệu cá nhân" });
  await expect(section).toBeVisible();

  // Tải dữ liệu: file JSON có formatVersion 1 và đúng hồ sơ.
  const downloadPromise = page.waitForEvent("download");
  await section.getByRole("button", { name: "Tải dữ liệu của tôi (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^beanbox-du-lieu-ca-nhan-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const data = JSON.parse(await readFile(path, "utf8")) as {
    formatVersion: number;
    profile: { email: string; fullName: string };
    orders: unknown[];
  };
  expect(data.formatVersion).toBe(1);
  expect(data.profile.email).toBe(email);
  expect(data.profile.fullName).toBe("Khách Sắp Xóa");
  expect(data.orders).toEqual([]);

  // Xóa qua UI.
  await section.getByRole("button", { name: "Xóa tài khoản" }).click();
  const dialog = page.getByRole("dialog", { name: "Xóa tài khoản" });
  const confirm = dialog.getByRole("button", { name: "Xóa tài khoản vĩnh viễn" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Mật khẩu hiện tại").fill(PASSWORD);
  await dialog.getByLabel(/Gõ XOA TAI KHOAN/).fill("XOA TAI KHOAN");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/\?tai-khoan=da-xoa$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Tài khoản của bạn đã được xóa" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();

  // Đăng nhập lại bằng email cũ thất bại.
  await page.goto("/dang-nhap");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email hoặc mật khẩu không đúng" }),
  ).toBeVisible();
});
