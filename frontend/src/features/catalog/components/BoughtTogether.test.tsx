import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "../fixtures";

const serverGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/server", () => ({ serverGet }));
vi.mock("@/features/wishlist/components/WishlistButton", () => ({
  WishlistButton: () => null,
}));

import { getBoughtTogether } from "../api";
import { BoughtTogether, BoughtTogetherSection } from "./BoughtTogether";

beforeEach(() => serverGet.mockReset());

describe("BoughtTogetherSection", () => {
  it("có dữ liệu -> heading h2 và thẻ sản phẩm có link", () => {
    render(
      <BoughtTogetherSection
        products={[
          makeProduct({ id: "p1", slug: "phin-inox", name: "Phin inox" }),
          makeProduct({ id: "p2", slug: "ca-phe-a", name: "Cà phê A" }),
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Thường được mua cùng" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thường được mua cùng" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Phin inox/ })).toHaveAttribute(
      "href",
      "/san-pham/phin-inox",
    );
  });

  it("rỗng -> không render section", () => {
    const { container } = render(<BoughtTogetherSection products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BoughtTogether (server)", () => {
  it("gọi API với limit 4 và hiển thị kết quả", async () => {
    serverGet.mockResolvedValue({ data: [makeProduct({ id: "p1", slug: "a", name: "SP A" })] });
    render(await BoughtTogether({ slug: "x" }));
    expect(serverGet).toHaveBeenCalledWith("/products/x/bought-together", {
      query: { limit: 4 },
      revalidate: 60,
    });
    expect(screen.getByRole("heading", { name: "Thường được mua cùng" })).toBeInTheDocument();
  });

  it("API lỗi hoặc trả rỗng -> không có section, không ném lỗi", async () => {
    serverGet.mockRejectedValueOnce(new Error("boom"));
    const a = render(await BoughtTogether({ slug: "x" }));
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();

    serverGet.mockResolvedValueOnce({ data: [] });
    const b = render(await BoughtTogether({ slug: "x" }));
    expect(b.container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("getBoughtTogether cắt tối đa 4 và trả [] khi data không phải mảng", async () => {
    serverGet.mockResolvedValueOnce({
      data: Array.from({ length: 6 }, (_, i) => makeProduct({ id: `p${i}` })),
    });
    expect(await getBoughtTogether("x")).toHaveLength(4);
    serverGet.mockResolvedValueOnce({ data: null });
    expect(await getBoughtTogether("x")).toEqual([]);
  });
});
