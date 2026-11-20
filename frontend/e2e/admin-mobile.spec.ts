import { expect, test, type Page } from "@playwright/test";
import {
  cancelGuestOrderApi,
  createGuestCodOrder,
  findStockedProduct,
  login,
  seedPassword,
} from "./helpers";

/**
 * D-048: các trang /admin không được cuộn ngang toàn trang ở 390 (điện thoại) và 768 (ngay
 * breakpoint md, nơi bảng `md:block` hiện ra). Chỉ 1 lượt đăng nhập admin cho cả spec.
 */
test.describe.configure({ mode: "serial" });

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
] as const;

interface Overflower {
  el: string;
  right: number;
  text: string;
}

interface Measure {
  scrollWidth: number;
  clientWidth: number;
  innerWidth: number;
  overflowers: Overflower[];
}

/** Đo độ tràn ngang; liệt kê phần tử thò ra ngoài viewport mà KHÔNG bị vùng overflow cắt. */
async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const iw = window.innerWidth;
    const clips = (a: Element) => {
      const s = getComputedStyle(a);
      return s.overflowX !== "visible";
    };
    const describe = (e: Element) => {
      const cls = (e.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 6).join(".");
      return `${e.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
    };
    const out: Overflower[] = [];
    for (const e of Array.from(document.body.querySelectorAll("*"))) {
      const cs = getComputedStyle(e);
      if (cs.position === "fixed" || cs.display === "none") continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Chữ dài không ngắt dòng có thể tràn khỏi hộp của chính nó: đo cả khung của text node.
      let right = r.right;
      for (const n of Array.from(e.childNodes)) {
        if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        right = Math.max(right, range.getBoundingClientRect().right);
      }
      if (right <= iw + 0.5) continue;
      // Phần tử absolute chỉ bị cắt bởi vùng overflow từ containing block của nó trở lên.
      let skipUntil: Element | null = null;
      let waiting = false;
      if (cs.position === "absolute") {
        skipUntil = (e as HTMLElement).offsetParent;
        waiting = true;
      }
      let clipped = false;
      for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        if (waiting) {
          if (a !== skipUntil) continue;
          waiting = false;
        }
        if (clips(a)) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      out.push({
        el: describe(e),
        right: Math.round(right),
        text: (e.textContent ?? "").trim().slice(0, 40),
      });
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: iw,
      overflowers: out.slice(0, 8),
    };
  });
}

async function firstHref(page: Page, listPath: string, pattern: RegExp): Promise<string> {
  await page.goto(listPath);
  await page.waitForLoadState("networkidle");
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const found = hrefs.find((h) => pattern.test(h));
  if (!found) throw new Error(`Không tìm thấy link ${pattern} ở ${listPath}`);
  return found;
}

test("các trang admin không cuộn ngang ở 390 và 768, menu và hộp thoại dùng được", async ({
  page,
  request,
}) => {
  test.setTimeout(420_000);
  const stocked = await findStockedProduct(request);
  const order = await createGuestCodOrder(request, stocked.variantId);
  try {
    await runChecks(page, order);
  } finally {
    // Hủy đơn guest (mã + SĐT) để hoàn kho; chạy cả khi test fail giữa chừng.
    await cancelGuestOrderApi(request, order.code, order.phone);
  }
});

async function runChecks(page: Page, order: { code: string }) {
  await login(page, "admin@beanbox.local", seedPassword("ADMIN"));

  // Lấy đường dẫn chi tiết từ href thật trong các danh sách (thẻ mobile và bảng desktop cùng có link).
  await page.setViewportSize({ width: 1280, height: 800 });
  const orderHref = `/admin/don-hang/${order.code}`;
  const productHref = await firstHref(
    page,
    "/admin/san-pham",
    /^\/admin\/san-pham\/(?!moi)[^/?]+$/,
  );
  const couponHref = await firstHref(
    page,
    "/admin/ma-giam-gia",
    /^\/admin\/ma-giam-gia\/(?!moi)[^/?]+$/,
  );
  const userHref = await firstHref(page, "/admin/nguoi-dung", /^\/admin\/nguoi-dung\/[^/?]+$/);
  // Tin nhắn liên hệ có thể chưa có trong DB sạch: tạo 1 tin qua API công khai là bước thừa với
  // rate limit 3/10 phút, nên chỉ kiểm chi tiết khi danh sách có dữ liệu.
  const contactHref = await firstHref(page, "/admin/lien-he", /^\/admin\/lien-he\/[^/?]+$/).catch(
    () => null,
  );

  const pages: { name: string; path: string }[] = [
    { name: "Tổng quan", path: "/admin" },
    { name: "Phân tích kinh doanh", path: "/admin/phan-tich" },
    { name: "Đơn hàng", path: "/admin/don-hang" },
    { name: "Chi tiết đơn", path: orderHref },
    { name: "In đơn", path: `${orderHref}/in` },
    { name: "Sản phẩm", path: "/admin/san-pham" },
    { name: "Sản phẩm mới", path: "/admin/san-pham/moi" },
    { name: "Sửa sản phẩm", path: productHref },
    { name: "Tồn kho", path: "/admin/ton-kho" },
    { name: "Lịch sử kho", path: "/admin/ton-kho/lich-su" },
    { name: "Mã giảm giá", path: "/admin/ma-giam-gia" },
    { name: "Mã giảm giá mới", path: "/admin/ma-giam-gia/moi" },
    { name: "Sửa mã giảm giá", path: couponHref },
    { name: "Danh mục", path: "/admin/danh-muc" },
    { name: "Thương hiệu", path: "/admin/thuong-hieu" },
    { name: "Đánh giá", path: "/admin/danh-gia" },
    { name: "Liên hệ", path: "/admin/lien-he" },
    ...(contactHref ? [{ name: "Chi tiết liên hệ", path: contactHref }] : []),
    { name: "Người dùng", path: "/admin/nguoi-dung" },
    { name: "Chi tiết người dùng", path: userHref },
    { name: "Cài đặt", path: "/admin/cai-dat" },
    { name: "Nhật ký", path: "/admin/nhat-ky" },
  ];

  const rows: string[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const p of pages) {
      await page.goto(p.path);
      await expect(page.locator("main h1, h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(200);
      const m = await measure(page);
      rows.push(`${vp.width} ${p.path} sw=${m.scrollWidth} cw=${m.clientWidth}`);
      // Sai số 0: scrollWidth làm tròn nguyên, vượt clientWidth dù 1px là đã có cuộn ngang.
      expect
        .soft(
          m.scrollWidth,
          `${p.name} (${p.path}) @${vp.width}: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}. Phần tử gây tràn: ${JSON.stringify(m.overflowers)}`,
        )
        .toBeLessThanOrEqual(m.clientWidth);
    }
  }
  console.log(rows.join("\n"));

  // Khả dụng ở 390: menu admin mở được, mọi link chạm được và nằm trong viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const menuBtn = page.getByRole("button", { name: "Menu quản trị" });
  await expect(menuBtn).toBeVisible();
  await menuBtn.click();
  await expect(menuBtn).toHaveAttribute("aria-expanded", "true");
  const navLinks = page.getByRole("navigation", { name: "Quản trị" }).getByRole("link");
  const count = await navLinks.count();
  expect(count).toBeGreaterThanOrEqual(12);
  for (let i = 0; i < count; i++) {
    const box = await navLinks.nth(i).boundingBox();
    expect(box, `link menu #${i} phải hiển thị`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  await page
    .getByRole("navigation", { name: "Quản trị" })
    .getByRole("link", { name: "Đơn hàng" })
    .click();
  await expect(page).toHaveURL(/\/admin\/don-hang$/);

  // Nút thao tác chính hiện trong viewport; hộp thoại điều chỉnh tồn kho vừa màn hình.
  await page.goto("/admin/san-pham");
  const addProduct = page.getByRole("link", { name: /Thêm sản phẩm/ }).first();
  await expect(addProduct).toBeVisible();
  const addBox = await addProduct.boundingBox();
  expect(addBox!.x + addBox!.width).toBeLessThanOrEqual(390);

  await page.goto("/admin/ton-kho");
  await page
    .getByRole("button", { name: /^Điều chỉnh tồn kho/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dBox = await dialog.boundingBox();
  expect(dBox!.x).toBeGreaterThanOrEqual(0);
  expect(dBox!.x + dBox!.width).toBeLessThanOrEqual(390);
  expect(dBox!.y + dBox!.height).toBeLessThanOrEqual(844);
  expect((await measure(page)).scrollWidth).toBeLessThanOrEqual(390);
}
