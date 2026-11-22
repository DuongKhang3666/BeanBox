import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getProducts: vi.fn(),
  getPublicSettings: vi.fn(),
}));
vi.mock("@/features/catalog/api", () => ({
  getCategories: () => api.getCategories(),
  getProducts: (q: unknown) => api.getProducts(q),
}));
vi.mock("@/features/content/publicSettings", () => ({
  getPublicSettings: () => api.getPublicSettings(),
}));
vi.mock("@/features/catalog/components/ProductGrid", () => ({
  ProductGrid: () => <div data-testid="grid" />,
}));
vi.mock("@/features/content/components/HomeBanners", () => ({ HomeBanners: () => null }));

import HomePage, * as home from "./page";

describe("trang chủ ISR (D-064)", () => {
  it("revalidate = 60 và không phụ thuộc request (không connection())", () => {
    expect(home.revalidate).toBe(60);
  });

  it("API lỗi hoàn toàn: vẫn render hero, các mục hiện trạng thái lỗi, không ném", async () => {
    const down = new Error("down");
    api.getCategories.mockRejectedValue(down);
    api.getProducts.mockRejectedValue(down);
    api.getPublicSettings.mockRejectedValue(down);
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText("Chưa tải được mục này").length).toBe(4);
    expect(screen.queryByTestId("grid")).toBeNull();
  });

  it("API ổn: hiện danh mục và lưới sản phẩm", async () => {
    api.getCategories.mockResolvedValue([
      { id: "1", name: "Cà phê hạt", slug: "ca-phe-hat", productCount: 3, children: [] },
    ]);
    api.getProducts.mockResolvedValue({ items: [{ id: "p" }], meta: {} });
    api.getPublicSettings.mockResolvedValue({ home: { banners: [] } });
    render(await HomePage());
    expect(screen.getByText("Cà phê hạt")).toBeInTheDocument();
    expect(screen.getAllByTestId("grid").length).toBe(3);
  });
});
