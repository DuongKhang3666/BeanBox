import { api } from "@/lib/api/client";
import type { WishlistItem } from "@/types/catalog";

export async function getWishlistIds(): Promise<string[]> {
  const { data } = await api.get<{ productIds: string[] }>("/me/wishlist/ids");
  return data.productIds ?? [];
}

export async function listWishlist(): Promise<WishlistItem[]> {
  const { data } = await api.get<WishlistItem[]>("/me/wishlist");
  return data;
}

export async function addToWishlist(productId: string): Promise<void> {
  await api.post<{ productId: string; addedAt: string }>("/me/wishlist", { productId });
}

export async function removeFromWishlist(productId: string): Promise<void> {
  await api.delete<void>(`/me/wishlist/${encodeURIComponent(productId)}`);
}
