import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCart } from "../testing";
import { MiniCart } from "./MiniCart";

const closeMiniCart = vi.fn();
let open = true;
vi.mock("../CartProvider", () => ({
  useCart: () => ({ miniCartOpen: open, closeMiniCart, cart: makeCart() }),
}));

beforeEach(() => {
  closeMiniCart.mockReset();
  open = true;
  document.body.style.overflow = "";
});

describe("MiniCart", () => {
  it("không render khi đóng", () => {
    open = false;
    render(<MiniCart />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dialog có tiêu đề, dòng hàng, tạm tính, link; focus vào dialog; khóa scroll", () => {
    const { unmount } = render(<MiniCart />);
    const dialog = screen.getByRole("dialog", { name: "Giỏ hàng của bạn" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(screen.getAllByText("Robusta Buôn Ma Thuột").length).toBeGreaterThan(0);
    expect(screen.getByText("Tạm tính").nextSibling).toHaveTextContent("330.000₫");
    expect(screen.getByRole("link", { name: "Xem giỏ hàng" })).toHaveAttribute("href", "/gio-hang");
    expect(screen.getByRole("link", { name: "Thanh toán" })).toHaveAttribute("href", "/thanh-toan");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("ảnh có kích thước cố định (không w-full), cột thông tin min-w-0, cột giá không xuống dòng", () => {
    render(<MiniCart />);
    const li = screen.getByRole("dialog").querySelector("li")!;
    expect(li).toHaveClass("min-w-0");
    const imgWrap = li.firstElementChild as HTMLElement;
    expect(imgWrap).toHaveClass("w-16", "h-16", "shrink-0");
    expect(imgWrap).not.toHaveClass("w-full");
    const info = li.children[1] as HTMLElement;
    expect(info).toHaveClass("min-w-0", "flex-1");
    const price = li.children[2] as HTMLElement;
    expect(price).toHaveClass("shrink-0", "whitespace-nowrap");
  });

  it("Escape, nút đóng và click nền đều đóng", async () => {
    render(<MiniCart />);
    await userEvent.keyboard("{Escape}");
    expect(closeMiniCart).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Đóng giỏ hàng" }));
    expect(closeMiniCart).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByTestId("minicart-overlay"));
    expect(closeMiniCart).toHaveBeenCalledTimes(3);
  });
});
