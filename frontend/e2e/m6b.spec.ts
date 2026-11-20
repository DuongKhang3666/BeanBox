import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
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

  // Phân tích kinh doanh (chỉ Admin): KPI hiển thị, đổi preset đổi URL, không lỗi
  await page.goto("/admin");
  await page.getByRole("link", { name: "Xem phân tích chi tiết" }).click();
  await expect(page).toHaveURL(/\/admin\/phan-tich$/);
  await expect(page.getByRole("heading", { name: "Phân tích kinh doanh" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Doanh thu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "7 ngày", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/phan-tich\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("button", { name: "7 ngày", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("region", { name: "Doanh thu", exact: true })).toBeVisible();
  await expect(page.getByText("Không tải được số liệu phân tích")).toHaveCount(0);

  // Bước 2: cơ cấu doanh thu, top sản phẩm, top khách hàng (dùng chung phiên admin, không đăng nhập thêm)
  await expect(page.getByRole("heading", { name: "Cơ cấu doanh thu" })).toBeVisible();
  await page
    .getByRole("group", { name: "Chiều phân tích" })
    .getByRole("button", { name: "Thanh toán", exact: true })
    .click();
  await expect(page).toHaveURL(/dim=paymentMethod/);
  await expect(
    page
      .getByRole("group", { name: "Chiều phân tích" })
      .getByRole("button", { name: "Thanh toán" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Top sản phẩm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top khách hàng" })).toBeVisible();
  // Bước 3: mục lục neo, khách hàng, vận hành, tồn kho (cùng phiên admin)
  const toc = page.getByRole("navigation", { name: "Mục lục phân tích" });
  await expect(toc.getByRole("link")).toHaveCount(7);
  await toc.getByRole("link", { name: "Tồn kho", exact: true }).click();
  await expect(page).toHaveURL(/#an-inventory$/);
  for (const t of ["Khách hàng", "Vận hành", "Tồn kho"]) {
    await expect(page.getByRole("heading", { name: t, exact: true })).toBeVisible();
  }
  const inventory = page
    .getByRole("heading", { name: "Tồn kho", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(inventory.getByText("Số liệu hiện tại, không theo khoảng ngày.")).toBeVisible();
  await expect(page.getByRole("status", { name: /^Đang tải/ })).toHaveCount(0);
  await inventory.getByRole("button", { name: /^Bán chậm \(\d+\)$/ }).click();
  await expect(inventory.getByRole("button", { name: /^Bán chậm \(\d+\)$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(inventory.getByRole("button", { name: "60 ngày", exact: true })).toBeVisible();
  // Mỗi khối ra kết quả (bảng hoặc thông báo rỗng), không khối nào lỗi hay còn loading
  await expect(page.getByRole("status", { name: /^Đang tải/ })).toHaveCount(0);
  for (const t of [
    "Không tải được số liệu khách hàng",
    "Không tải được số liệu vận hành",
    "Không tải được số liệu tồn kho",
    "Không tải được cơ cấu doanh thu",
    "Không tải được top sản phẩm",
    "Không tải được top khách hàng",
    "Không tải được hiệu quả mã giảm giá",
  ]) {
    await expect(page.getByText(t)).toHaveCount(0);
  }
  // Bước 4: khối Mã giảm giá và xuất CSV (cùng phiên admin, không đăng nhập thêm)
  await expect(page.getByRole("heading", { name: "Mã giảm giá", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV top sản phẩm" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^beanbox-top-products-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
  const text = bytes.toString("utf8");
  expect(text.split("\r\n")[0]).toBe(
    "\uFEFFHạng,Sản phẩm,Danh mục,Doanh thu (VND),Số lượng,Số đơn,Ghi chú",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Bạn xuất quá nhanh" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xuất CSV top sản phẩm" })).toBeEnabled();

  // Quét a11y trang phân tích: fail khi có vi phạm serious/critical
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const hard = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    );
  expect(hard, "Vi phạm a11y nghiêm trọng ở /admin/phan-tich").toEqual([]);

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

test("chính sách vận chuyển hiển thị phí; CSP storefront thực thi, admin có nonce", async ({
  page,
}) => {
  await page.goto("/chinh-sach/van-chuyen");
  await expect(page.getByText(/Tiêu chuẩn/).first()).toBeVisible();

  const res = await page.request.get("/");
  expect(res.status()).toBe(200);
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  expect(csp).toContain("report-uri /api/v1/csp-report");
  expect(res.headers()["content-security-policy-report-only"]).toBeUndefined();

  const admin = await page.request.get("/admin");
  const adminCsp = admin.headers()["content-security-policy"];
  expect(adminCsp).toContain("'nonce-");
  expect(adminCsp).toContain("'strict-dynamic'");
  expect(admin.headers()["content-security-policy-report-only"]).toBeUndefined();
});
