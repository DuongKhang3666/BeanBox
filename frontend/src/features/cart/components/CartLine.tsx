"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { CartItem } from "@/types/cart";
import { useCart } from "../CartProvider";
import {
  MAX_LINE_QUANTITY,
  cartErrorMessage,
  cartWarningMessage,
  isLineUnavailable,
} from "../messages";

export function CartLine({ item }: { item: CartItem }) {
  const { updateItem, removeItem, pending } = useCart();
  const [error, setError] = useState<string | null>(null);
  const busy = pending.itemIds.has(item.id);
  const unavailable = isLineUnavailable(item);
  const max = Math.min(item.maxQuantity, MAX_LINE_QUANTITY);
  const onSale = item.listPrice > item.unitPrice;

  async function change(next: number) {
    setError(null);
    try {
      await updateItem(item.id, next);
    } catch (e) {
      setError(cartErrorMessage(e));
    }
  }

  async function remove() {
    setError(null);
    try {
      await removeItem(item.id);
    } catch (e) {
      setError(cartErrorMessage(e));
    }
  }

  const stepBtn =
    "h-11 w-11 text-lg text-coffee-800 hover:bg-coffee-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <li className="flex gap-3 py-4 sm:gap-4" aria-busy={busy || undefined}>
      <ProductImage
        src={item.product.imageUrl}
        name={item.product.name}
        sizes="96px"
        className={cn("h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-24", unavailable && "opacity-50")}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={cn(unavailable && "opacity-60")}>
          <Link
            href={`/san-pham/${item.product.slug}`}
            className="line-clamp-2 font-semibold text-coffee-900 hover:underline"
          >
            {item.product.name}
          </Link>
          <p className="text-sm text-coffee-700">{item.variant.name}</p>
          <p className="text-sm text-coffee-800">
            {onSale ? (
              <del className="mr-2 text-coffee-600">{formatVND(item.listPrice)}</del>
            ) : null}
            <span className="font-medium">{formatVND(item.unitPrice)}</span>
          </p>
        </div>

        {item.warnings.length > 0 ? (
          <ul className="space-y-1">
            {item.warnings.map((w) => (
              <li
                key={w}
                role="status"
                className="rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-800"
              >
                {cartWarningMessage(w, item)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {unavailable ? null : (
            <div
              className="inline-flex items-center rounded-lg border border-coffee-400 bg-white"
              role="group"
              aria-label={`Số lượng ${item.product.name}`}
            >
              <button
                type="button"
                className={stepBtn}
                aria-label="Giảm số lượng"
                disabled={busy || item.quantity <= 1}
                onClick={() => change(item.quantity - 1)}
              >
                −
              </button>
              <span
                className="w-10 border-x border-coffee-300 text-center text-base leading-11 text-coffee-900"
                aria-live="polite"
                data-testid="line-qty"
              >
                {item.quantity}
              </span>
              <button
                type="button"
                className={stepBtn}
                aria-label="Tăng số lượng"
                disabled={busy || item.quantity >= max}
                onClick={() => change(item.quantity + 1)}
              >
                +
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Xóa ${item.product.name} khỏi giỏ hàng`}
            className="h-11 rounded-lg px-2 text-sm font-medium text-danger-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Xóa
          </button>
          <p
            className={cn(
              "ml-auto text-base font-bold text-coffee-900",
              unavailable && "line-through opacity-60",
            )}
          >
            {formatVND(item.lineTotal)}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger-600">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
