import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_PATHS } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

vi.mock("next/server", () => ({ connection: async () => {} }));
const getCategories = vi.fn();
const getProducts = vi.fn();
vi.mock("@/features/catalog/api", () => ({
  getCategories: () => getCategories(),
  getProducts: (q: unknown) => getProducts(q),
}));

import sitemap from "./sitemap";

const urls = (list: Awaited<ReturnType<typeof sitemap>>) => list.map((e) => e.url);

beforeEach(() => {
  getCategories.mockReset();
  getProducts.mockReset();
  getCategories.mockResolvedValue([
    { slug: "ca-phe-hat", children: [{ slug: "robusta" }] },
    { slug: "phu-kien", children: [] },
  ]);
  getProducts.mockResolvedValue({
    items: [{ slug: "sp-1", updatedAt: "2026-11-01T00:00:00.000Z" }, { slug: "sp-2" }],
    meta: { totalPages: 1 },
  });
});

describe("sitemap", () => {
  it("gồm trang tĩnh, danh mục (cả con) và sản phẩm với URL tuyệt đối", async () => {
    const list = urls(await sitemap());
    expect(list).toContain(`${SITE_URL}/`);
    expect(list).toContain(`${SITE_URL}/danh-muc/ca-phe-hat`);
    expect(list).toContain(`${SITE_URL}/danh-muc/robusta`);
    expect(list).toContain(`${SITE_URL}/san-pham/sp-1`);
    expect(list).toContain(`${SITE_URL}/san-pham/sp-2`);
  });

  it("có lastModified khi API trả updatedAt, không có thì bỏ qua", async () => {
    const list = await sitemap();
    const p1 = list.find((e) => e.url.endsWith("/san-pham/sp-1"));
    const p2 = list.find((e) => e.url.endsWith("/san-pham/sp-2"));
    expect(p1?.lastModified).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(p2).not.toHaveProperty("lastModified");
  });

  it("không chứa trang riêng tư hay trang tìm kiếm", async () => {
    const list = urls(await sitemap());
    for (const u of list) {
      const path = u.slice(SITE_URL.length);
      for (const priv of PRIVATE_PATHS) expect(path.startsWith(priv)).toBe(false);
      expect(path.startsWith("/tim-kiem")).toBe(false);
    }
  });

  it("API lỗi hoàn toàn vẫn trả trang tĩnh", async () => {
    getCategories.mockRejectedValue(new Error("down"));
    getProducts.mockRejectedValue(new Error("down"));
    const list = urls(await sitemap());
    expect(list).toContain(`${SITE_URL}/`);
    expect(list.some((u) => u.includes("/danh-muc/") || u.includes("/san-pham/"))).toBe(false);
  });

  it("sản phẩm lỗi nhưng danh mục ổn -> vẫn có danh mục", async () => {
    getProducts.mockRejectedValue(new Error("down"));
    const list = urls(await sitemap());
    expect(list).toContain(`${SITE_URL}/danh-muc/ca-phe-hat`);
    expect(list.some((u) => u.includes("/san-pham/"))).toBe(false);
  });
});
