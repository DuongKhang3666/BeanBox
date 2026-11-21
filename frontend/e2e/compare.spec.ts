import { expect, test } from "@playwright/test";
import { API } from "./helpers";

/**
 * So sánh sản phẩm (D-047): danh sách lưu ở localStorage, không cần đăng nhập
 * (không tốn lượt rate limit đăng nhập).
 */
const CATEGORY = "ca-phe-hat";

interface ListItem {
  slug: string;
  name: string;
  coffee: { originCountry: string | null; roastLevel: string | null } | null;
}

test("so sánh 2 sản phẩm cà phê hạt từ trang danh mục", async ({ page, request }) => {
  // Chọn 2 sản phẩm trong trang đầu (12 sản phẩm) có xuất xứ và mức rang khác nhau để chắc chắn có điểm khác.
  const res = await request.get(`${API}/products?category=${CATEGORY}&pageSize=12`);
  expect(res.ok()).toBeTruthy();
  const list = ((await res.json()) as { data: ListItem[] }).data;
  const first = list.find((p) => p.coffee?.originCountry && p.coffee.roastLevel);
  const second = list.find(
    (p) =>
      p.slug !== first?.slug &&
      p.coffee?.originCountry &&
      p.coffee.originCountry !== first?.coffee?.originCountry &&
      p.coffee.roastLevel !== first?.coffee?.roastLevel,
  );
  expect(first, "cần sản phẩm cà phê hạt trong seed").toBeTruthy();
  expect(second, "cần 2 sản phẩm khác xuất xứ và mức rang trong seed").toBeTruthy();

  await page.goto(`/danh-muc/${CATEGORY}`);
  const bar = page.getByRole("complementary", { name: "So sánh sản phẩm" });
  await expect(bar).toHaveCount(0);

  for (const p of [first!, second!]) {
    const toggle = page.getByRole("button", { name: `Thêm ${p.name} vào so sánh`, exact: true });
    await toggle.click();
    await expect(
      page.getByRole("button", { name: `Bỏ ${p.name} khỏi so sánh`, exact: true }).first(),
    ).toHaveAttribute("aria-pressed", "true");
  }

  const link = bar.getByRole("link", { name: "So sánh (2)" });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/so-sanh\?sp=/);
  expect(new URL(page.url()).searchParams.get("sp")).toBe(`${first!.slug},${second!.slug}`);
  await expect(bar).toHaveCount(0); // thanh so sánh ẩn ở /so-sanh

  const table = page.getByRole("table", { name: /So sánh 2 sản phẩm/ });
  await expect(table).toBeVisible();
  await expect(table.locator("thead").getByRole("link")).toHaveCount(2);
  await expect(table.getByRole("rowheader", { name: "Mức rang" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Thương hiệu" })).toBeVisible();

  // Cùng thương hiệu nên hàng này biến mất khi chỉ xem điểm khác nhau; mức rang khác nhau thì còn.
  await page.getByRole("checkbox", { name: "Chỉ hiện điểm khác nhau" }).check();
  await expect(table.getByRole("rowheader", { name: "Thương hiệu" })).toHaveCount(0);
  await expect(table.getByRole("rowheader", { name: "Mức rang" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Xuất xứ" })).toBeVisible();

  // Tải lại trang: dữ liệu lấy từ URL, vẫn hiển thị bảng.
  await page.reload();
  await expect(page.getByRole("table", { name: /So sánh 2 sản phẩm/ })).toBeVisible();

  // Bỏ 1 sản phẩm: còn 1 -> hướng dẫn chọn thêm.
  await page.getByRole("button", { name: `Bỏ khỏi so sánh: ${second!.name}` }).click();
  await expect(page.getByText("Chọn thêm ít nhất 1 sản phẩm")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Xem danh mục sản phẩm" })).toBeVisible();

  // Quay lại danh mục: sản phẩm còn lại vẫn trong danh sách, sản phẩm đã bỏ thì không.
  await page.goto(`/danh-muc/${CATEGORY}`);
  await expect(bar).toBeVisible();
  await expect(bar.getByText("So sánh (1)")).toBeVisible();
  await expect(bar.getByText("Chọn thêm ít nhất 1 sản phẩm")).toBeVisible();
  await bar.getByRole("button", { name: "Xóa tất cả" }).click();
  await expect(bar).toHaveCount(0);
});

test.describe("so sánh trên mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  // Hồi quy: chữ `sr-only` (position: absolute) trong ô bảng "—" lọt ra ngoài vùng cuộn ngang khi vùng
  // cuộn không phải là containing block, làm cả trang cuộn ngang (scrollWidth ~635px trên màn 390px).
  test("bảng so sánh cuộn ngang trong vùng riêng, trang không tràn ngang", async ({
    page,
    request,
  }) => {
    const res = await request.get(`${API}/products?category=${CATEGORY}&pageSize=12`);
    const slugs = ((await res.json()) as { data: { slug: string }[] }).data
      .slice(0, 4)
      .map((p) => p.slug);
    expect(slugs.length).toBe(4);
    await page.goto(`/so-sanh?sp=${slugs.join(",")}`);
    const table = page.getByRole("table", { name: /So sánh 4 sản phẩm/ });
    await expect(table).toBeVisible();
    const region = page.getByRole("region", { name: /Bảng so sánh sản phẩm/ });
    const m = await region.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeGreaterThan(m.cw); // bảng cuộn ngang trong vùng riêng
    const docW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docW).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
