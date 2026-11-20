import { describe, expect, it, vi } from "vitest";

// Trang/layout riêng tư phải khai báo robots noindex (kiểm tra metadata, không render).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  notFound: vi.fn(),
  redirect: vi.fn(),
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
