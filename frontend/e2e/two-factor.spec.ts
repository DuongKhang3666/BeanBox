import { expect, test, type Page } from "@playwright/test";
import { API, login, randomDigits, seedPassword } from "./helpers";
import { base32Decode, freshCode } from "./totp";

/**
 * D-063: xác thực 2 lớp (TOTP) cho Staff/Admin.
 * Dùng một tài khoản STAFF tạo riêng (đăng ký qua API rồi Admin nâng vai trò), KHÔNG bật 2FA trên tài
 * khoản seed dùng chung với spec khác.
 * Lượt gọi tính vào limiter auth (AUTH_RATE_LIMIT_PER_MIN=30): API đăng ký 1 + đăng nhập admin 1 +
 * đăng nhập UI 1 + setup 1 + enable 1 + (đăng nhập bước 1 + bước 2 sai + bước 2 đúng) + (bước 1 + bước 2 mã dự phòng) + disable 1 + đăng nhập lại 1 = 12.
 */

test.describe.configure({ mode: "serial" });

const PASSWORD = "Matkhau2FA123";

async function createStaff(request: import("@playwright/test").APIRequestContext) {
  const email = `e2e-2fa-${randomDigits(8)}@example.com`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { fullName: "Nhân Viên Hai Lớp", email, password: PASSWORD },
  });
  expect(reg.status(), "register").toBe(201);
  const userId = ((await reg.json()) as { data: { user: { id: string } } }).data.user.id;

  const adminLogin = await request.post(`${API}/auth/login`, {
    data: { email: "admin@beanbox.local", password: seedPassword("ADMIN") },
  });
  expect(adminLogin.status(), "admin login").toBe(200);
  const adminToken = ((await adminLogin.json()) as { data: { accessToken: string } }).data
    .accessToken;
  const role = await request.patch(`${API}/admin/users/${userId}/role`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { role: "STAFF" },
  });
  expect(role.status(), "đổi vai trò").toBe(200);
  return email;
}

const section = (page: Page) => page.getByRole("region", { name: "Xác thực 2 lớp" });

async function logout(page: Page) {
  await page.getByRole("button", { name: "Đăng xuất" }).first().click();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
}

async function submitCredentials(page: Page, email: string) {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("bật 2FA, đăng nhập bằng TOTP, bằng mã dự phòng (dùng một lần), rồi tắt 2FA", async ({
  page,
  request,
}) => {
  const email = await createStaff(request);

  // ---- Bật 2FA ----
  await login(page, email, PASSWORD);
  await page.goto("/tai-khoan");
  await expect(section(page).getByText("Chưa bật")).toBeVisible();
  await section(page).getByRole("button", { name: "Bật xác thực 2 lớp" }).click();
  await section(page).getByLabel("Mật khẩu hiện tại").fill(PASSWORD);
  await section(page).getByRole("button", { name: "Tiếp tục" }).click();

  await expect(
    section(page).getByRole("img", { name: /Mã QR để thêm tài khoản BeanBox/ }),
  ).toBeVisible();
  const grouped = (await section(page).getByTestId("tf-secret").textContent()) ?? "";
  expect(grouped).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/); // 32 ký tự, nhóm 4
  const secret = base32Decode(grouped);
  expect(secret).toHaveLength(20);

  const enableCode = await freshCode(secret, null);
  const codeInput = section(page).getByLabel("Mã 6 số từ ứng dụng");
  await expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
  await codeInput.fill(enableCode.code);
  await section(page).getByRole("button", { name: "Xác nhận và bật" }).click();

  await expect(
    section(page).getByRole("heading", { name: "Lưu mã dự phòng của bạn" }),
  ).toBeVisible();
  const codes = await section(page).getByTestId("backup-code").allTextContents();
  expect(codes).toHaveLength(10);
  for (const c of codes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
  await section(page)
    .getByLabel(/Tôi đã lưu các mã dự phòng/)
    .check();
  await section(page).getByRole("button", { name: "Hoàn tất" }).click();
  await expect(section(page).getByText("Đã bật", { exact: true })).toBeVisible();

  // ---- Đăng nhập 2 bước bằng TOTP ----
  await logout(page);
  await submitCredentials(page, email);
  const stepInput = page.getByLabel("Mã xác thực", { exact: true });
  await expect(stepInput).toBeVisible();
  await expect(stepInput).toBeFocused();
  await expect(page.getByText(/hết hạn sau/)).toBeVisible();
  // Chưa có phiên: chưa thấy nút Đăng xuất
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(0);

  // Mã sai bị từ chối (tính vào lockout nhưng chỉ 1 lần)
  const wrong = enableCode.code === "000000" ? "000001" : "000000";
  await stepInput.fill(wrong);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText("Mã xác thực không đúng hoặc đã được sử dụng.")).toBeVisible();

  const loginCode = await freshCode(secret, enableCode.step);
  await stepInput.fill(loginCode.code);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" }).first()).toBeVisible();

  // ---- Đăng nhập bằng mã dự phòng (một lần) ----
  await logout(page);
  await submitCredentials(page, email);
  await page.getByRole("button", { name: "Dùng mã dự phòng" }).click();
  const backupInput = page.getByLabel("Mã dự phòng", { exact: true });
  await expect(backupInput).toBeFocused();
  await backupInput.fill(codes[0]!);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" }).first()).toBeVisible();

  // ---- Tắt 2FA (mật khẩu + mã) ----
  await page.goto("/tai-khoan");
  await section(page).getByRole("button", { name: "Tắt xác thực 2 lớp" }).click();
  await section(page).getByLabel("Mật khẩu hiện tại").fill(PASSWORD);
  const disableCode = await freshCode(secret, loginCode.step);
  await section(page).getByLabel("Mã xác thực hoặc mã dự phòng").fill(disableCode.code);
  await section(page).getByRole("button", { name: "Tắt xác thực 2 lớp" }).last().click();
  await expect(page.getByText(/Đã tắt xác thực 2 lớp/)).toBeVisible();
  await expect(section(page).getByText("Chưa bật")).toBeVisible();

  // Sau khi tắt: đăng nhập một bước như cũ
  await logout(page);
  await login(page, email, PASSWORD);
});
