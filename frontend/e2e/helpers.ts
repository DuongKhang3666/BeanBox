import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** API backend gọi trực tiếp (không qua rewrite của Next). */
export const API = `http://127.0.0.1:${process.env.E2E_API_PORT || 4000}/api/v1`;

/** Hậu tố ngẫu nhiên 8 chữ số để SĐT/email test không trùng giữa các lần chạy. */
export function randomDigits(n = 8): string {
  let s = "";
  while (s.length < n) s += Math.floor(Math.random() * 10);
  return s;
}

export function testContact() {
  const suffix = randomDigits(8);
  return {
    email: `e2e+${suffix}@example.com`,
    phone: `09${suffix}`.slice(0, 10), // 09 + 8 chữ số = 10 số, khớp ^0(3|5|7|8|9)\d{8}$
  };
}

export function seedPassword(role: "ADMIN" | "STAFF" | "CUSTOMER"): string {
  const v = process.env[`SEED_${role}_PASSWORD`];
  if (!v) throw new Error(`Thiếu SEED_${role}_PASSWORD (đặt trong backend/.env)`);
  return v;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  // Sau đăng nhập có thể ở /tai-khoan (nút ở header và ở menu tài khoản): lấy nút đầu tiên để tránh lỗi strict mode.
  await expect(page.getByRole("button", { name: "Đăng xuất" }).first()).toBeVisible();
}

export interface StockedProduct {
  slug: string;
  name: string;
  variantId: string;
}

/** Tìm một sản phẩm còn hàng (biến thể IN_STOCK, maxQuantity >= 2) trong danh mục. */
export async function findStockedProduct(
  request: APIRequestContext,
  category = "ca-phe-hat",
): Promise<StockedProduct> {
  const list = await request.get(`${API}/products?category=${category}&pageSize=20`);
  expect(list.ok()).toBeTruthy();
  const products = (
    (await list.json()) as { data: { slug: string; name: string; inStock: boolean }[] }
  ).data;
  for (const p of products.filter((x) => x.inStock)) {
    const res = await request.get(`${API}/products/${p.slug}`);
    const detail = (await res.json()) as {
      data: { variants: { id: string; stockStatus: string; maxQuantity: number }[] };
    };
    const v = detail.data.variants.find((x) => x.stockStatus === "IN_STOCK" && x.maxQuantity >= 2);
    if (v) return { slug: p.slug, name: p.name, variantId: v.id };
  }
  throw new Error("Không có sản phẩm còn hàng trong dữ liệu seed (chạy npm run prisma:seed)");
}

/** Tạo đơn cho khách vãng lai qua API (mặc định COD); trả mã đơn và SĐT dùng để tra cứu. */
export async function createGuestCodOrder(
  request: APIRequestContext,
  variantId: string,
  paymentMethod: "COD" | "BANK_TRANSFER" = "COD",
) {
  const contact = testContact();
  const add = await request.post(`${API}/cart/items`, { data: { variantId, quantity: 1 } });
  expect(add.status()).toBeLessThan(300);
  const cartToken = add.headers()["x-cart-token"];
  expect(cartToken).toBeTruthy();
  const res = await request.post(`${API}/orders`, {
    headers: { "X-Cart-Token": cartToken!, "Idempotency-Key": randomUUID() },
    data: {
      contact,
      shippingAddress: {
        fullName: "Nguyễn Kiểm Thử",
        phone: contact.phone,
        provinceCode: "79",
        wardCode: "26740",
        line1: "12 Lê Lợi",
      },
      shippingMethod: "STANDARD",
      paymentMethod,
      acceptTerms: true,
    },
  });
  expect(res.status(), "POST /orders").toBe(201);
  const code = ((await res.json()) as { data: { code: string } }).data.code;
  return { code, phone: contact.phone };
}

/** Hủy đơn guest qua API (mã + SĐT, không cần đăng nhập) để hoàn kho sau khi test tạo đơn. */
export async function cancelGuestOrderApi(
  request: APIRequestContext,
  code: string,
  phone: string,
): Promise<void> {
  const res = await request.post(`${API}/orders/${encodeURIComponent(code)}/cancel`, {
    data: { reason: "Dọn dẹp đơn test E2E", phone },
  });
  expect(res.status(), "POST /orders/:code/cancel").toBe(200);
}

/**
 * Bấm "Thêm vào giỏ" an toàn: chờ nút đã hydrate (`data-ready`) và bật, rồi chờ phản hồi
 * `POST /cart/items` (không chờ thời gian cố định). Bấm trước khi hydrate làm mất cú bấm.
 */
export async function addToCartWhenReady(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Thêm vào giỏ" });
  await expect(button).toHaveAttribute("data-ready", "true");
  await expect(button).toBeEnabled();
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/cart\/items(\?|$)/.test(r.url()),
  );
  await button.click();
  expect((await response).status(), "POST /cart/items").toBeLessThan(300);
}
