import { describe, expect, it, vi } from "vitest";
import { NOINDEX_PATHS } from "@/lib/seo";

// Trang/layout riêng tư phải khai báo robots noindex (kiểm tra metadata, không render).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const getCategories = vi.hoisted(() => vi.fn());
vi.mock("@/features/catalog/api", () => ({
  getCategories: () => getCategories(),
  getBrands: vi.fn(),
  getCoffeeOrigins: vi.fn(),
  getProducts: vi.fn(),
  lookupCategory: vi.fn(),
}));

type Mod = { metadata?: { robots?: unknown } };
type Robots = { index?: boolean; follow?: boolean } | undefined;

const MODULES: Record<string, () => Promise<Mod>> = {
  "/tai-khoan (layout)": () => import("./tai-khoan/layout"),
  "/tai-khoan/don-hang": () => import("./tai-khoan/don-hang/page"),
  "/tai-khoan/dia-chi": () => import("./tai-khoan/dia-chi/page"),
  "/gio-hang": () => import("./gio-hang/page"),
  "/so-sanh": () => import("./so-sanh/page"),
  "/thanh-toan": () => import("./thanh-toan/page"),
  "/thanh-toan/ket-qua": () => import("./thanh-toan/ket-qua/page"),
  "/cong-thanh-toan-gia-lap/vnpay": () => import("./cong-thanh-toan-gia-lap/vnpay/page"),
  "/cong-thanh-toan-gia-lap/momo": () => import("./cong-thanh-toan-gia-lap/momo/page"),
  "/dat-hang-thanh-cong/[code]": () => import("./dat-hang-thanh-cong/[code]/page"),
  "/tra-cuu-don-hang": () => import("./tra-cuu-don-hang/page"),
  "/dang-nhap": () => import("./dang-nhap/page"),
  "/dang-ky": () => import("./dang-ky/page"),
  "/quen-mat-khau": () => import("./quen-mat-khau/page"),
  "/dat-lai-mat-khau": () => import("./dat-lai-mat-khau/page"),
  "/xac-thuc-email": () => import("./xac-thuc-email/page"),
  "/admin (layout)": () => import("./admin/layout"),
};

describe("noindex cho trang riêng tư", () => {
  it("mọi đường dẫn trong NOINDEX_PATHS đều có module được kiểm bên dưới (D-069)", () => {
    const covered = [...Object.keys(MODULES), "/tim-kiem"].map((k) => k.split(" ")[0]!);
    for (const p of NOINDEX_PATHS) {
      expect(covered.some((c) => c === p || c.startsWith(`${p}/`))).toBe(true);
    }
  });

  for (const [name, load] of Object.entries(MODULES)) {
    it(name, async () => {
      const mod = await load();
      expect((mod.metadata?.robots as Robots)?.index).toBe(false);
    });
  }

  it("/tim-kiem: noindex, follow", async () => {
    const { generateMetadata } = await import("./tim-kiem/page");
    const meta = await generateMetadata({ searchParams: Promise.resolve({ q: "robusta" }) });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });
});

describe("canonical/robots trang danh mục (D-064)", () => {
  const generate = async (slug: string, sp: Record<string, string | string[]>) => {
    getCategories.mockResolvedValue([
      {
        id: "1",
        name: "Cà phê hạt",
        slug: "ca-phe-hat",
        imageUrl: null,
        productCount: 1,
        children: [],
      },
    ]);
    const { generateMetadata } = await import("./danh-muc/[slug]/page");
    return generateMetadata({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve(sp),
    });
  };

  it("trang 1: canonical = path, được index", async () => {
    const meta = await generate("ca-phe-hat", {});
    expect(meta.alternates?.canonical).toBe("/danh-muc/ca-phe-hat");
    expect(meta.robots).toBeUndefined();
    expect(JSON.stringify(meta.openGraph?.images)).toContain("/opengraph-image");
    expect(JSON.stringify(meta.twitter?.images)).toContain("/opengraph-image");
  });

  it("trang 2: canonical tự trỏ ?page=2, được index", async () => {
    const meta = await generate("ca-phe-hat", { page: "2" });
    expect(meta.alternates?.canonical).toBe("/danh-muc/ca-phe-hat?page=2");
    expect(meta.robots).toBeUndefined();
  });

  it("có lọc/sắp xếp: noindex,follow và canonical về URL không lọc (cùng trang)", async () => {
    for (const sp of <Record<string, string>[]>[
      { roast: "LIGHT" },
      { brand: "beanbox" },
      { minPrice: "100000" },
      { origin: "Ethiopia" },
      { sort: "price_asc" },
      { inStock: "true" },
      { pageSize: "24" },
    ]) {
      const meta = await generate("ca-phe-hat", sp);
      expect(meta.robots).toMatchObject({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/danh-muc/ca-phe-hat");
    }
    const p3 = await generate("ca-phe-hat", { roast: "LIGHT", page: "3" });
    expect(p3.alternates?.canonical).toBe("/danh-muc/ca-phe-hat?page=3");
    expect(p3.robots).toMatchObject({ index: false, follow: true });
  });

  it("tham số lạ/không hợp lệ không làm mất index", async () => {
    const meta = await generate("ca-phe-hat", { utm_source: "x", roast: "SAI" });
    expect(meta.robots).toBeUndefined();
  });

  it("trang chủ có canonical '/'", async () => {
    const { metadata } = await import("./page");
    expect(metadata.alternates?.canonical).toBe("/");
  });
});
