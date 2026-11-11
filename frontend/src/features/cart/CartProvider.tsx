"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CART_TOKEN_KEY } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Cart, MergeMeta } from "@/types/cart";
import { useAuth } from "../auth/AuthProvider";
import * as cartApi from "./api";
import { MERGE_ADJUSTED_NOTICE } from "./messages";

export type CartStatus = "idle" | "loading" | "ready" | "error";

export interface CartPending {
  adding: boolean;
  clearing: boolean;
  /** Đang áp/bỏ mã giảm giá. */
  coupon: boolean;
  /** id các dòng đang được sửa/xóa. */
  itemIds: ReadonlySet<string>;
}

export interface CartContextValue {
  /** null khi chưa tải xong hoặc tải lỗi. */
  cart: Cart | null;
  status: CartStatus;
  /**
   * Lỗi tải giỏ. Khi `status === "error"` là lỗi nặng (không có giỏ để hiển thị);
   * khi `status === "ready"` là lỗi nhẹ (ví dụ chưa gộp được giỏ khách) và `reload` sẽ thử lại.
   */
  error: Error | null;
  /** Thông báo sau merge (có thể đóng bằng dismissNotice). */
  notice: string | null;
  pending: CartPending;
  /** Các action trả Promise<Cart> và ném ApiError để component tự hiển thị lỗi (dùng cartErrorMessage). */
  addItem: (variantId: string, quantity: number) => Promise<Cart>;
  updateItem: (itemId: string, quantity: number) => Promise<Cart>;
  removeItem: (itemId: string) => Promise<Cart>;
  clearCart: () => Promise<Cart>;
  applyCoupon: (code: string) => Promise<Cart>;
  removeCoupon: () => Promise<Cart>;
  /** Tải lại giỏ (hoặc thử lại merge nếu còn token guest). */
  reload: () => void;
  dismissNotice: () => void;
  miniCartOpen: boolean;
  openMiniCart: () => void;
  closeMiniCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readToken(): string | null {
  try {
    return window.localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string) {
  try {
    window.localStorage.setItem(CART_TOKEN_KEY, token);
  } catch {
    /* localStorage không khả dụng: bỏ qua */
  }
}
function removeToken() {
  try {
    window.localStorage.removeItem(CART_TOKEN_KEY);
  } catch {
    /* bỏ qua */
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [status, setStatus] = useState<CartStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  /** Đếm phiên tải: kết quả của lần tải cũ bị bỏ. */
  const sessionRef = useRef(0);
  /** Dùng chung một lần merge đang chạy (StrictMode chạy effect 2 lần). */
  const mergeRef = useRef<Promise<{ cart: Cart; meta: MergeMeta | undefined }> | null>(null);
  const authRef = useRef(authStatus);
  useEffect(() => {
    authRef.current = authStatus;
  });

  const applyCart = useCallback((next: Cart) => {
    if (next.cartToken) writeToken(next.cartToken);
    setCart(next);
    setStatus("ready");
  }, []);

  const runLoad = useCallback(
    async (id: number, authed: boolean) => {
      const isCurrent = () => sessionRef.current === id;
      let mergeError: Error | null = null;

      if (authed && readToken()) {
        try {
          const promise = (mergeRef.current ??= cartApi.mergeCart().finally(() => {
            mergeRef.current = null;
          }));
          const { cart: merged, meta } = await promise;
          removeToken();
          if (!isCurrent()) return;
          applyCart(merged);
          setError(null);
          if (meta?.adjustments && meta.adjustments.length > 0) setNotice(MERGE_ADJUSTED_NOTICE);
          return;
        } catch (e) {
          // Giữ token guest để lần sau thử lại; vẫn cho người dùng xem giỏ tài khoản.
          mergeError = e instanceof Error ? e : new Error("merge failed");
        }
      }

      try {
        const loaded = await cartApi.getCart();
        if (!isCurrent()) return;
        applyCart(loaded);
        if (mergeError) {
          setError(mergeError);
          setNotice("Chưa thể gộp giỏ hàng đã chọn trước đó vào tài khoản. Vui lòng thử lại.");
        } else {
          setError(null);
        }
      } catch (e) {
        if (!isCurrent()) return;
        setError(e instanceof Error ? e : new Error("load failed"));
        setStatus("error");
      }
    },
    [applyCart],
  );

  const startLoad = useCallback(
    (id: number, resetCart: boolean, authed: boolean) => {
      setStatus("loading");
      setError(null);
      if (resetCart) {
        setCart(null);
        setNotice(null);
      }
      void runLoad(id, authed);
    },
    [runLoad],
  );

  // Chờ auth xác định; mỗi lần auth đổi (đăng nhập, đăng ký, khôi phục phiên, đăng xuất) tải lại/merge.
  useEffect(() => {
    if (authStatus === "loading") return;
    const id = ++sessionRef.current;
    let active = true;
    // Hoãn một microtask: StrictMode (mount -> cleanup -> mount) chỉ bắt đầu một lần tải/merge.
    queueMicrotask(() => {
      if (active && sessionRef.current === id) startLoad(id, true, authStatus === "authenticated");
    });
    return () => {
      active = false;
    };
  }, [authStatus, startLoad]);

  const reload = useCallback(
    () => startLoad(++sessionRef.current, false, authRef.current === "authenticated"),
    [startLoad],
  );

  const track = useCallback(
    async (key: string, fn: () => Promise<Cart>, reloadOn404 = false): Promise<Cart> => {
      setPendingKeys((prev) => new Set(prev).add(key));
      try {
        const next = await fn();
        applyCart(next);
        return next;
      } catch (e) {
        if (reloadOn404 && e instanceof ApiError && e.status === 404) {
          cartApi
            .getCart()
            .then(applyCart)
            .catch(() => undefined);
        }
        throw e;
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [applyCart],
  );

  const addItem = useCallback(
    (variantId: string, quantity: number) =>
      track("add", () => cartApi.addItem(variantId, quantity)),
    [track],
  );
  const updateItem = useCallback(
    (itemId: string, quantity: number) =>
      track(`item:${itemId}`, () => cartApi.updateItem(itemId, quantity), true),
    [track],
  );
  const removeItem = useCallback(
    (itemId: string) => track(`item:${itemId}`, () => cartApi.removeItem(itemId), true),
    [track],
  );
  const clearCart = useCallback(() => track("clear", () => cartApi.clearCart()), [track]);
  const applyCoupon = useCallback(
    (code: string) => track("coupon", () => cartApi.applyCoupon(code)),
    [track],
  );
  const removeCoupon = useCallback(() => track("coupon", () => cartApi.removeCoupon()), [track]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const openMiniCart = useCallback(() => setMiniCartOpen(true), []);
  const closeMiniCart = useCallback(() => setMiniCartOpen(false), []);

  const pending = useMemo<CartPending>(() => {
    const itemIds = new Set<string>();
    for (const k of pendingKeys) if (k.startsWith("item:")) itemIds.add(k.slice(5));
    return {
      adding: pendingKeys.has("add"),
      clearing: pendingKeys.has("clear"),
      coupon: pendingKeys.has("coupon"),
      itemIds,
    };
  }, [pendingKeys]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      status,
      error,
      notice,
      pending,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      reload,
      dismissNotice,
      miniCartOpen,
      openMiniCart,
      closeMiniCart,
    }),
    [
      cart,
      status,
      error,
      notice,
      pending,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      reload,
      dismissNotice,
      miniCartOpen,
      openMiniCart,
      closeMiniCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart phải được dùng bên trong <CartProvider>");
  return ctx;
}
