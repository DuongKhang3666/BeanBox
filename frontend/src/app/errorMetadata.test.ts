import { describe, expect, it, vi } from "vitest";

// Nhánh API lỗi: trang trả ErrorState (HTTP 200) nên metadata phải noindex (D-059).
vi.mock("@/features/catalog/api", () => ({
  lookupProduct: vi.fn(async () => {
    throw new Error("API sập");
  }),
  getCategories: vi.fn(async () => {
    throw new Error("API sập");
  }),
  getBrands: vi.fn(),
  getCoffeeOrigins: vi.fn(),
  getProducts: vi.fn(),
  lookupCategory: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  notFound: vi.fn(),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

describe("metadata khi API lỗi", () => {
  it("/san-pham/[slug]: noindex, nofollow", async () => {
    const { generateMetadata } = await import("./san-pham/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "phin-inox" }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("/danh-muc/[slug]: noindex, nofollow", async () => {
    const { generateMetadata } = await import("./danh-muc/[slug]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "ca-phe-hat" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
