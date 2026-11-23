import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderCart } from "@/components/layout/HeaderCart";
import { AddToCartPanel } from "@/features/catalog/components/AddToCartPanel";
import { makeVariant } from "@/features/catalog/fixtures";
import * as cartApi from "../api";
import { CartProvider } from "../CartProvider";
import { makeCart } from "../testing";
import { MiniCart } from "./MiniCart";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "anonymous" }) }));
vi.mock("../api");

const api = vi.mocked(cartApi);

/** Dựng thật CartProvider + nút "Thêm vào giỏ" + nút giỏ ở header + MiniCart; chỉ API giỏ là giả. */
function Page({ withButton = true }: { withButton?: boolean }) {
  const [shown, setShown] = useState(withButton);
  return (
    <CartProvider>
      <HeaderCart />
      {shown ? <AddToCartPanel variants={[makeVariant({ id: "vx" })]} /> : null}
      <button type="button" onClick={() => setShown(false)}>
        Gỡ nút thêm
      </button>
      <MiniCart />
    </CartProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getCart.mockResolvedValue(makeCart());
  document.body.style.overflow = "";
});

describe("MiniCart trả focus khi đóng", () => {
  it("về đúng nút 'Thêm vào giỏ' (đã enabled lại) dù nút bị disable lúc đang thêm", async () => {
    let finish!: () => void;
    api.addItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(makeCart());
        }),
    );
    const u = userEvent.setup();
    render(<Page />);
    const add = await screen.findByRole("button", { name: "Thêm vào giỏ" });
    await waitFor(() => expect(add).toBeEnabled());
    await u.click(add);
    // Đang thêm: nút bị disable (mất focus) trước khi hộp thoại mở
    expect(await screen.findByRole("button", { name: "Đang thêm..." })).toBeDisabled();
    await act(async () => finish());

    const dialog = await screen.findByRole("dialog", { name: "Giỏ hàng của bạn" });
    expect(dialog).toHaveFocus();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toHaveFocus();
  });

  it("nút kích hoạt không còn trong DOM -> focus về nút giỏ ở header", async () => {
    api.addItem.mockResolvedValue(makeCart());
    const u = userEvent.setup();
    render(<Page />);
    const add = await screen.findByRole("button", { name: "Thêm vào giỏ" });
    await waitFor(() => expect(add).toBeEnabled());
    await u.click(add);
    await screen.findByRole("dialog", { name: "Giỏ hàng của bạn" });
    // Nút kích hoạt biến mất khi hộp thoại đang mở (ví dụ trang đổi nội dung)
    await act(async () => {
      screen.getByRole("button", { name: "Gỡ nút thêm", hidden: true }).click();
    });
    expect(screen.queryByRole("button", { name: "Thêm vào giỏ", hidden: true })).toBeNull();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: /^Giỏ hàng, \d+ sản phẩm$/ })).toHaveFocus();
  });

  it("nút kích hoạt bị disable khi đóng -> focus về nút giỏ ở header", async () => {
    api.addItem.mockResolvedValue(makeCart());
    const u = userEvent.setup();
    render(<Page />);
    const add = await screen.findByRole("button", { name: "Thêm vào giỏ" });
    await waitFor(() => expect(add).toBeEnabled());
    await u.click(add);
    await screen.findByRole("dialog", { name: "Giỏ hàng của bạn" });
    (add as HTMLButtonElement).disabled = true;
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: /^Giỏ hàng, \d+ sản phẩm$/ })).toHaveFocus();
  });
});
