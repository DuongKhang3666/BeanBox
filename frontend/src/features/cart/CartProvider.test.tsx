import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CART_TOKEN_KEY } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { AuthStatus } from "../auth/AuthProvider";
import * as cartApi from "./api";
import { CartProvider, useCart, type CartContextValue } from "./CartProvider";
import { makeCart, makeCartItem } from "./testing";

let authStatus: AuthStatus = "anonymous";
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ status: authStatus }) }));
vi.mock("./api");

const api = vi.mocked(cartApi);
let ctx: CartContextValue;

function Probe() {
  const value = useCart();
  useEffect(() => {
    ctx = value;
  });
  return (
    <p data-testid="s">
      {value.status}:{value.cart?.itemCount ?? "-"}:{value.notice ?? ""}
    </p>
  );
}

function tree() {
  return (
    <CartProvider>
      <Probe />
    </CartProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  authStatus = "anonymous";
});

describe("CartProvider", () => {
  it("chờ auth xong mới tải giỏ", async () => {
    authStatus = "loading";
    api.getCart.mockResolvedValue(makeCart());
    const { rerender } = render(tree());
    await act(async () => {});
    expect(api.getCart).not.toHaveBeenCalled();
    expect(screen.getByTestId("s")).toHaveTextContent("idle");
    authStatus = "anonymous";
    rerender(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(api.getCart).toHaveBeenCalledTimes(1);
  });

  it("lưu cartToken khi server cấp mới (ghi đè token cũ)", async () => {
    window.localStorage.setItem(CART_TOKEN_KEY, "old");
    api.getCart.mockResolvedValue(makeCart({ items: [], itemCount: 0 }));
    api.addItem.mockResolvedValue(makeCart({ cartToken: "new-token" }));
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready"));
    expect(window.localStorage.getItem(CART_TOKEN_KEY)).toBe("old");
    await act(async () => {
      await ctx.addItem("v1", 2);
    });
    expect(api.addItem).toHaveBeenCalledWith("v1", 2);
    expect(window.localStorage.getItem(CART_TOKEN_KEY)).toBe("new-token");
    expect(screen.getByTestId("s")).toHaveTextContent("ready:2");
  });

  it("đăng nhập có token local -> merge, xóa token, báo điều chỉnh", async () => {
    window.localStorage.setItem(CART_TOKEN_KEY, "guest");
    authStatus = "authenticated";
    api.mergeCart.mockResolvedValue({
      cart: makeCart(),
      meta: {
        merged: true,
        adjustments: [{ variantId: "v1", requested: 25, final: 20, reason: "QUANTITY_LIMIT" }],
      },
    });
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(api.mergeCart).toHaveBeenCalledTimes(1);
    expect(api.getCart).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CART_TOKEN_KEY)).toBeNull();
    expect(ctx.notice).toMatch(/điều chỉnh số lượng theo tồn kho/);
  });

  it("merge không có điều chỉnh -> không có notice", async () => {
    window.localStorage.setItem(CART_TOKEN_KEY, "guest");
    authStatus = "authenticated";
    api.mergeCart.mockResolvedValue({ cart: makeCart(), meta: { merged: true, adjustments: [] } });
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(ctx.notice).toBeNull();
  });

  it("đăng nhập không có token -> không merge, chỉ GET /cart", async () => {
    authStatus = "authenticated";
    api.getCart.mockResolvedValue(makeCart());
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(api.mergeCart).not.toHaveBeenCalled();
    expect(api.getCart).toHaveBeenCalledTimes(1);
  });

  it("StrictMode không merge 2 lần", async () => {
    window.localStorage.setItem(CART_TOKEN_KEY, "guest");
    authStatus = "authenticated";
    api.mergeCart.mockResolvedValue({ cart: makeCart(), meta: { merged: true, adjustments: [] } });
    render(<StrictMode>{tree()}</StrictMode>);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(api.mergeCart).toHaveBeenCalledTimes(1);
  });

  it("merge lỗi mạng: giữ token, fallback GET /cart, có error để thử lại", async () => {
    window.localStorage.setItem(CART_TOKEN_KEY, "guest");
    authStatus = "authenticated";
    api.mergeCart.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "x"));
    api.getCart.mockResolvedValue(makeCart());
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    expect(window.localStorage.getItem(CART_TOKEN_KEY)).toBe("guest");
    expect(ctx.error).not.toBeNull();

    api.mergeCart.mockResolvedValueOnce({
      cart: makeCart(),
      meta: { merged: true, adjustments: [] },
    });
    await act(async () => ctx.reload());
    await waitFor(() => expect(ctx.error).toBeNull());
    expect(window.localStorage.getItem(CART_TOKEN_KEY)).toBeNull();
  });

  it("đăng xuất (authenticated -> anonymous) tải lại giỏ guest", async () => {
    authStatus = "authenticated";
    api.getCart.mockResolvedValueOnce(makeCart());
    const { rerender } = render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));

    api.getCart.mockResolvedValueOnce(makeCart({ items: [], itemCount: 0 }));
    authStatus = "anonymous";
    rerender(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:0"));
    expect(api.getCart).toHaveBeenCalledTimes(2);
    expect(api.mergeCart).not.toHaveBeenCalled();
  });

  it("bỏ kết quả của lần tải cũ khi auth đổi giữa chừng", async () => {
    let resolveOld!: (c: ReturnType<typeof makeCart>) => void;
    api.getCart.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    const { rerender } = render(tree());
    await waitFor(() => expect(api.getCart).toHaveBeenCalledTimes(1));

    api.getCart.mockResolvedValueOnce(makeCart({ items: [], itemCount: 0 }));
    authStatus = "authenticated";
    rerender(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:0"));
    await act(async () => resolveOld(makeCart()));
    expect(screen.getByTestId("s")).toHaveTextContent("ready:0");
  });

  it("404 khi sửa dòng -> tự tải lại giỏ và ném lỗi", async () => {
    api.getCart.mockResolvedValue(makeCart({ items: [makeCartItem()] }));
    api.updateItem.mockRejectedValue(new ApiError(404, "NOT_FOUND", "x"));
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    await act(async () => {
      await expect(ctx.updateItem("ci1", 3)).rejects.toBeInstanceOf(ApiError);
    });
    await waitFor(() => expect(api.getCart).toHaveBeenCalledTimes(2));
  });

  it("pending theo dòng bật trong lúc chờ", async () => {
    api.getCart.mockResolvedValue(makeCart());
    let resolve!: (c: ReturnType<typeof makeCart>) => void;
    api.updateItem.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(tree());
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ready:2"));
    let p!: Promise<unknown>;
    act(() => {
      p = ctx.updateItem("ci1", 3);
    });
    expect(ctx.pending.itemIds.has("ci1")).toBe(true);
    await act(async () => {
      resolve(makeCart());
      await p;
    });
    expect(ctx.pending.itemIds.has("ci1")).toBe(false);
  });
});
