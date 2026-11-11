import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { makeVariant } from "../fixtures";
import { AddToCartPanel } from "./AddToCartPanel";

const addItem = vi.fn();
const openMiniCart = vi.fn();
let adding = false;
vi.mock("@/features/cart/CartProvider", () => ({
  useCart: () => ({ addItem, openMiniCart, pending: { adding } }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  adding = false;
});

describe("AddToCartPanel + giỏ hàng", () => {
  it("bấm thêm -> addItem(variantId, số lượng) rồi mở MiniCart", async () => {
    addItem.mockResolvedValue({});
    render(<AddToCartPanel variants={[makeVariant({ id: "vx" })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Tăng số lượng" }));
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(addItem).toHaveBeenCalledWith("vx", 2);
    expect(openMiniCart).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("OUT_OF_STOCK -> thông báo inline, không mở MiniCart", async () => {
    addItem.mockRejectedValue(
      new ApiError(409, "OUT_OF_STOCK", "x", { items: [{ variantId: "v1", available: 1 }] }),
    );
    render(<AddToCartPanel variants={[makeVariant()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chỉ còn 1 sản phẩm");
    expect(openMiniCart).not.toHaveBeenCalled();
  });

  it("đang thêm -> nút 'Đang thêm...' disabled", () => {
    adding = true;
    render(<AddToCartPanel variants={[makeVariant()]} />);
    expect(screen.getByRole("button", { name: "Đang thêm..." })).toBeDisabled();
  });

  it("hết hàng -> nút disabled, không gọi addItem", async () => {
    render(
      <AddToCartPanel variants={[makeVariant({ stockStatus: "OUT_OF_STOCK", maxQuantity: 0 })]} />,
    );
    const btn = screen.getByRole("button", { name: "Hết hàng" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(addItem).not.toHaveBeenCalled();
  });
});
