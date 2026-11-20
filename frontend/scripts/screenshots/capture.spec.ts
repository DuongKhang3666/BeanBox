import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API, seedPassword } from "../../e2e/helpers";

/**
 * Chụp ảnh cho README vào docs/screenshots/*.png. Xem docs/screenshots/README.md và
 * playwright.screenshots.config.ts (an toàn DB/cổng). Giả định DB tạm VỪA migrate + seed:
 * chạy lại cần DB mới. Chỉ dùng dữ liệu demo (tên, SĐT, email @example.com là giả).
 * Tổng đăng nhập: 1 admin + 1 customer (rate limit đăng nhập).
 */
const OUT_DIR = path.resolve(__dirname, "../../../docs/screenshots");
const CART_TOKEN_KEY = "bb_cart_token"; // khớp src/lib/api/client.ts
const SESSION_FLAG_KEY = "bb_has_session"; // khớp src/lib/api/client.ts
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const WEB = `http://localhost:${process.env.SHOTS_WEB_PORT || 3100}`;

const CONTEXT_OPTIONS = {
  baseURL: WEB,
  locale: "vi-VN",
  timezoneId: "Asia/Ho_Chi_Minh",
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  viewport: DESKTOP,
} as const;

test.describe.configure({ mode: "serial" });

interface ListedProduct {
  slug: string;
  name: string;
  inStock: boolean;
  images?: { url: string }[];
  thumbnailUrl?: string | null;
  primaryImage?: { url: string } | null;
  category?: { name: string } | null;
}
interface Variant {
  id: string;
  name?: string;
  stockStatus: string;
  maxQuantity: number;
}
interface Demo {
  slug: string;
  name: string;
  variantId: string;
  variantCount: number;
}

async function json<T>(
  res: Awaited<ReturnType<APIRequestContext["get"]>>,
  what: string,
): Promise<T> {
  expect(res.ok(), `${what}: HTTP ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { data: T }).data;
}

/** Lấy các sản phẩm còn hàng (kèm số biến thể) từ vài danh mục. */
async function stockedProducts(request: APIRequestContext): Promise<Demo[]> {
  const out: Demo[] = [];
  for (const category of ["ca-phe-hat", "dung-cu-pha-che", "phu-kien", "qua-tang-combo"]) {
    const list = await json<ListedProduct[]>(
      await request.get(`${API}/products?category=${category}&pageSize=20`),
      `GET /products ${category}`,
    );
    for (const p of list.filter((x) => x.inStock)) {
      const d = await json<{ variants: Variant[] }>(
        await request.get(`${API}/products/${p.slug}`),
        `GET /products/${p.slug}`,
      );
      const v = d.variants.find((x) => x.stockStatus === "IN_STOCK" && x.maxQuantity >= 3);
      if (v)
        out.push({ slug: p.slug, name: p.name, variantId: v.id, variantCount: d.variants.length });
    }
  }
  expect(out.length, "cần >= 8 sản phẩm còn hàng từ seed").toBeGreaterThanOrEqual(8);
  return out;
}

interface Person {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
}

const GUESTS: Person[] = [
  {
    fullName: "Trần Minh Anh",
    email: "minhanh.tran@example.com",
    phone: "0912000101",
    line1: "25 Nguyễn Huệ",
  },
  {
    fullName: "Lê Hoàng Nam",
    email: "hoangnam.le@example.com",
    phone: "0912000102",
    line1: "88 Điện Biên Phủ",
  },
  {
    fullName: "Phạm Thu Hà",
    email: "thuha.pham@example.com",
    phone: "0912000103",
    line1: "14 Võ Văn Tần",
  },
  {
    fullName: "Võ Quốc Bảo",
    email: "quocbao.vo@example.com",
    phone: "0912000104",
    line1: "102 Cách Mạng Tháng Tám",
  },
  {
    fullName: "Đặng Ngọc Linh",
    email: "ngoclinh.dang@example.com",
    phone: "0912000105",
    line1: "7 Pasteur",
  },
  {
    fullName: "Bùi Gia Huy",
    email: "giahuy.bui@example.com",
    phone: "0912000106",
    line1: "230 Lý Thường Kiệt",
  },
];

function shipping(p: Person) {
  return {
    fullName: p.fullName,
    phone: p.phone,
    provinceCode: "79",
    wardCode: "26740",
    line1: p.line1,
  };
}

/** Thêm các biến thể vào giỏ (guest hoặc theo Bearer), trả cart token nếu là guest. */
async function fillCart(
  request: APIRequestContext,
  variantIds: string[],
  bearer?: string,
): Promise<string | undefined> {
  let token: string | undefined;
  for (const variantId of variantIds) {
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (token) headers["X-Cart-Token"] = token;
    const res = await request.post(`${API}/cart/items`, {
      headers,
      data: { variantId, quantity: 1 },
    });
    expect(res.status(), "POST /cart/items").toBeLessThan(300);
    if (!bearer && !token) token = res.headers()["x-cart-token"];
  }
  return token;
}

async function placeOrder(
  request: APIRequestContext,
  p: Person,
  variantIds: string[],
  bearer?: string,
): Promise<string> {
  const cartToken = await fillCart(request, variantIds, bearer);
  const headers: Record<string, string> = { "Idempotency-Key": randomUUID() };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  else headers["X-Cart-Token"] = cartToken!;
  const res = await request.post(`${API}/orders`, {
    headers,
    data: {
      contact: { email: p.email, phone: p.phone },
      shippingAddress: shipping(p),
      shippingMethod: "STANDARD",
      paymentMethod: "COD",
      acceptTerms: true,
    },
  });
  expect(res.status(), "POST /orders").toBe(201);
  return ((await res.json()) as { data: { code: string } }).data.code;
}

/** Đăng nhập qua proxy của web để cookie refresh thuộc origin web (trang tải lại vẫn có phiên). */
async function loginViaWeb(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await context.request.post(`${WEB}/api/v1/auth/login`, {
    headers: { Origin: WEB },
    data: { email, password },
  });
  expect(res.ok(), `login ${email}: HTTP ${res.status()}`).toBeTruthy();
  // FE chỉ gọi refresh khi có cờ phiên trong localStorage; cookie refresh đã nằm trong context.
  await context.addInitScript((k) => window.localStorage.setItem(k, "1"), SESSION_FLAG_KEY);
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

const STEPS: Record<string, { to: string; extra?: Record<string, string> }[]> = {
  CONFIRMED: [{ to: "CONFIRMED" }],
  SHIPPING: [
    { to: "CONFIRMED" },
    { to: "PROCESSING" },
    { to: "SHIPPING", extra: { trackingNumber: "GHN9120054871", carrier: "GHN" } },
  ],
  DELIVERED: [
    { to: "CONFIRMED" },
    { to: "PROCESSING" },
    { to: "SHIPPING", extra: { trackingNumber: "GHN9120054872", carrier: "GHN" } },
    { to: "DELIVERED" },
  ],
  CANCELLED: [{ to: "CANCELLED", extra: { note: "Khách đổi ý" } }],
};

async function advance(
  request: APIRequestContext,
  adminToken: string,
  code: string,
  target: keyof typeof STEPS,
): Promise<void> {
  let from = "PENDING";
  for (const step of STEPS[target]!) {
    const res = await request.patch(`${API}/admin/orders/${code}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { fromStatus: from, toStatus: step.to, ...step.extra },
    });
    expect(res.status(), `PATCH ${code} ${from}->${step.to}`).toBe(200);
    from = step.to;
  }
}

/** Chờ trang ổn định: mạng yên, font, ảnh trong viewport tải xong, không toast; cuộn về đầu. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const vh = window.innerHeight;
          return Array.from(document.images)
            .filter((img) => {
              const r = img.getBoundingClientRect();
              return r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0;
            })
            .filter((img) => !(img.complete && img.naturalWidth > 0)).length;
        }),
      { timeout: 20_000, message: "ảnh trong viewport chưa tải xong" },
    )
    .toBe(0);
  await expect(page.locator('[role="status"], [role="alert"]').filter({ hasText: /\S/ }))
    .toHaveCount(0, { timeout: 10_000 })
    .catch(() => undefined);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string, fullPage = false): Promise<void> {
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage });
}

async function withContext(
  browser: Browser,
  viewport: { width: number; height: number },
  fn: (ctx: BrowserContext, page: Page) => Promise<void>,
  init?: (ctx: BrowserContext) => Promise<void>,
): Promise<void> {
  const ctx = await browser.newContext({ ...CONTEXT_OPTIONS, viewport });
  try {
    if (init) await init(ctx);
    const page = await ctx.newPage();
    await fn(ctx, page);
  } finally {
    await ctx.close();
  }
}

let products: Demo[] = [];
let admin: BrowserContext;
let customer: BrowserContext;
let lookup: Person & { code: string };
let seedCartVariants: string[] = [];

test.beforeAll(async ({ browser, request }) => {
  test.setTimeout(300_000);
  products = await stockedProducts(request);
  const pick = (i: number, n = 2) => products.slice(i, i + n).map((p) => p.variantId);

  admin = await browser.newContext(CONTEXT_OPTIONS);
  customer = await browser.newContext(CONTEXT_OPTIONS);
  const adminToken = await loginViaWeb(admin, "admin@beanbox.local", seedPassword("ADMIN"));
  const customerToken = await loginViaWeb(
    customer,
    "customer@beanbox.local",
    seedPassword("CUSTOMER"),
  );

  // Đơn khách vãng lai: trạng thái đa dạng theo máy trạng thái (api-contract §11).
  const plan: { person: Person; items: string[]; target?: keyof typeof STEPS }[] = [
    { person: GUESTS[0]!, items: pick(0, 2), target: "DELIVERED" },
    { person: GUESTS[1]!, items: pick(2, 1), target: "DELIVERED" },
    { person: GUESTS[2]!, items: pick(3, 3), target: "SHIPPING" },
    { person: GUESTS[3]!, items: pick(5, 2), target: "CONFIRMED" },
    { person: GUESTS[4]!, items: pick(1, 2) },
    { person: GUESTS[5]!, items: pick(4, 1), target: "CANCELLED" },
  ];
  const codes: string[] = [];
  for (const e of plan) {
    const code = await placeOrder(request, e.person, e.items);
    codes.push(code);
    if (e.target) await advance(request, adminToken, code, e.target);
  }
  lookup = { ...GUESTS[2]!, code: codes[2]! }; // đơn đang giao: kết quả tra cứu có tiến trình

  // Đơn của customer@beanbox.local.
  const me: Person = {
    fullName: "Nguyễn Thị Mai",
    email: "customer@beanbox.local",
    phone: "0912000201",
    line1: "36 Trần Hưng Đạo",
  };
  const c1 = await placeOrder(request, me, pick(6, 2), customerToken);
  const c2 = await placeOrder(request, me, pick(0, 1), customerToken);
  await placeOrder(request, me, pick(2, 2), customerToken);
  await advance(request, adminToken, c1, "DELIVERED");
  await advance(request, adminToken, c2, "SHIPPING");

  seedCartVariants = [
    products[7]!.variantId,
    products[1]!.variantId,
    products[9 % products.length]!.variantId,
  ];
});

test.afterAll(async () => {
  await admin?.close();
  await customer?.close();
});

test("home.png", async ({ browser }) => {
  await withContext(browser, DESKTOP, async (_c, page) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shoot(page, "home");
  });
});

test("mobile-home.png", async ({ browser }) => {
  await withContext(browser, MOBILE, async (_c, page) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shoot(page, "mobile-home");
  });
});

test("category.png", async ({ browser }) => {
  await withContext(browser, DESKTOP, async (_c, page) => {
    await page.goto("/danh-muc/ca-phe-hat?roast=MEDIUM,MEDIUM_DARK&sort=popular");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shoot(page, "category");
  });
});

test("product.png", async ({ browser }) => {
  const p = products.find((x) => x.variantCount >= 2) ?? products[0]!;
  await withContext(browser, DESKTOP, async (_c, page) => {
    await page.goto(`/san-pham/${p.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(p.name);
    await shoot(page, "product");
  });
});

test("compare.png", async ({ browser }) => {
  const slugs = products.slice(0, 3).map((p) => p.slug);
  await withContext(browser, DESKTOP, async (_c, page) => {
    await page.goto(`/so-sanh?sp=${slugs.join(",")}`);
    await expect(page.getByRole("table")).toBeVisible();
    await shoot(page, "compare");
  });
});

async function withCart(
  browser: Browser,
  request: APIRequestContext,
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const token = await fillCart(request, seedCartVariants);
  await withContext(
    browser,
    DESKTOP,
    async (_c, page) => fn(page),
    async (ctx) => {
      await ctx.addInitScript(
        ([k, v]) => window.localStorage.setItem(k as string, v as string),
        [CART_TOKEN_KEY, token!],
      );
    },
  );
}

test("cart.png", async ({ browser, request }) => {
  await withCart(browser, request, async (page) => {
    await page.goto("/gio-hang");
    await expect(page.getByRole("link", { name: /Thanh toán|Tiến hành/ }).first()).toBeVisible();
    await shoot(page, "cart");
  });
});

test("checkout.png", async ({ browser, request }) => {
  await withCart(browser, request, async (page) => {
    const p = GUESTS[0]!;
    await page.goto("/thanh-toan");
    await page.getByLabel("Email").fill(p.email);
    await page.getByLabel("Số điện thoại", { exact: true }).fill(p.phone);
    await page.getByLabel("Họ và tên người nhận").fill(p.fullName);
    await page.getByLabel("Số điện thoại người nhận").fill(p.phone);
    await page.getByRole("combobox", { name: "Tỉnh/thành" }).click();
    await page.getByRole("option", { name: /Hồ Chí Minh/ }).click();
    const ward = page.getByRole("combobox", { name: "Phường/xã" });
    await expect(ward).toBeEnabled();
    await ward.click();
    await page.getByRole("option", { name: "Phường Sài Gòn", exact: true }).click();
    await page.getByLabel("Địa chỉ cụ thể (số nhà, đường)").fill(p.line1);
    await expect(page.getByRole("radio", { name: /tiêu chuẩn/i }).first()).toBeChecked();
    await page.getByRole("radio", { name: /thanh toán khi nhận hàng|COD/i }).check();
    // Không bấm "Đặt hàng".
    await shoot(page, "checkout");
  });
});

test("order-lookup.png", async ({ browser }) => {
  await withContext(browser, DESKTOP, async (_c, page) => {
    await page.goto("/tra-cuu-don-hang");
    await page.getByLabel("Mã đơn hàng").fill(lookup.code);
    await page.getByLabel("Số điện thoại đặt hàng").fill(lookup.phone);
    await page.getByRole("button", { name: "Tra cứu" }).click();
    await expect(
      page.getByRole("region", { name: "Kết quả tra cứu" }).getByText(lookup.code),
    ).toBeVisible();
    await shoot(page, "order-lookup");
  });
});

test("account-orders.png", async () => {
  const page = await customer.newPage();
  try {
    await page.goto("/tai-khoan/don-hang");
    await expect(page.getByRole("heading", { name: /Đơn hàng/ }).first()).toBeVisible();
    await expect(page.getByText(/BB-\d{6}-/).first()).toBeVisible();
    await shoot(page, "account-orders");
  } finally {
    await page.close();
  }
});

test("admin: dashboard, orders, product edit, mobile orders", async () => {
  const page = await admin.newPage();
  try {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/BB-\d{6}-/).first())
      .toBeVisible()
      .catch(() => undefined);
    await shoot(page, "admin-dashboard");

    await page.goto("/admin/don-hang");
    await expect(page.getByText(lookup.code).first()).toBeVisible();
    await shoot(page, "admin-orders", true); // cả trang: bộ lọc chiếm nhiều chỗ, bảng đơn nằm bên dưới

    await page.goto("/admin/san-pham");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Danh sách tải bất đồng bộ: chờ tới khi có link sửa sản phẩm.
    const editLink = page.locator('a[href^="/admin/san-pham/"]:not([href$="/moi"])').first();
    await expect(editLink).toBeVisible();
    const href = (await editLink.getAttribute("href"))!;
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shoot(page, "admin-product-edit");

    await page.setViewportSize(MOBILE);
    await page.goto("/admin/don-hang");
    await expect(page.locator("a:visible", { hasText: lookup.code }).first()).toBeVisible();
    await shoot(page, "mobile-admin-orders", true); // cả trang: thấy các thẻ đơn bên dưới bộ lọc
  } finally {
    await page.close();
  }
});
