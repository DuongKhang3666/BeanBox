import { api } from "@/lib/api/client";
import type { Cart, MergeMeta } from "@/types/cart";

export async function getCart(signal?: AbortSignal): Promise<Cart> {
  const { data } = await api.get<Cart>("/cart", { signal });
  return data;
}

export async function addItem(variantId: string, quantity: number): Promise<Cart> {
  const { data } = await api.post<Cart>("/cart/items", { variantId, quantity });
  return data;
}

export async function updateItem(itemId: string, quantity: number): Promise<Cart> {
  const { data } = await api.patch<Cart>(`/cart/items/${encodeURIComponent(itemId)}`, {
    quantity,
  });
  return data;
}

export async function removeItem(itemId: string): Promise<Cart> {
  const { data } = await api.delete<Cart>(`/cart/items/${encodeURIComponent(itemId)}`);
  return data;
}

export async function clearCart(): Promise<Cart> {
  const { data } = await api.delete<Cart>("/cart");
  return data;
}

export async function applyCoupon(code: string): Promise<Cart> {
  const { data } = await api.post<Cart>("/cart/apply-coupon", { code });
  return data;
}

export async function removeCoupon(): Promise<Cart> {
  const { data } = await api.delete<Cart>("/cart/coupon");
  return data;
}

/** Client tự gửi X-Cart-Token (giỏ guest) cùng Bearer. */
export async function mergeCart(): Promise<{ cart: Cart; meta: MergeMeta | undefined }> {
  const { data, meta } = await api.post<Cart, MergeMeta>("/cart/merge");
  return { cart: data, meta };
}
