import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeCart } from "@/features/cart/testing";
import { HeaderCart } from "./HeaderCart";

let count = 0;
vi.mock("@/features/cart/CartProvider", () => ({
  useCart: () => ({ cart: makeCart({ itemCount: count }) }),
}));

describe("HeaderCart", () => {
  it("không badge khi giỏ trống, aria-label có số lượng", () => {
    count = 0;
    render(<HeaderCart />);
    expect(screen.getByRole("link", { name: "Giỏ hàng, 0 sản phẩm" })).toHaveAttribute(
      "href",
      "/gio-hang",
    );
  });

  it("hiện số lượng và 99+ khi quá 99", () => {
    count = 5;
    const { rerender } = render(<HeaderCart />);
    expect(screen.getByText("5")).toBeInTheDocument();
    count = 150;
    rerender(<HeaderCart />);
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giỏ hàng, 150 sản phẩm" })).toBeInTheDocument();
  });
});
