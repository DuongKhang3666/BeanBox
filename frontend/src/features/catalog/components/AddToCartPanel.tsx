"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { Variant } from "@/types/catalog";
import { formatPlainDate, formatSaleDate } from "../dates";
import { STOCK_LABELS } from "../labels";
import { PriceTag } from "./PriceTag";
import { VariantSelector } from "./VariantSelector";

/** Mặc định: biến thể đầu tiên còn hàng; nếu không có thì biến thể đầu. */
export function pickDefaultVariant(variants: Variant[]): Variant | undefined {
  return variants.find((v) => v.stockStatus !== "OUT_OF_STOCK") ?? variants[0];
}

const STOCK_STYLE = {
  IN_STOCK: "text-moss-700",
  LOW_STOCK: "text-amber-700",
  OUT_OF_STOCK: "text-danger-600",
} as const;

export function AddToCartPanel({ variants }: { variants: Variant[] }) {
  const [selectedId, setSelectedId] = useState(() => pickDefaultVariant(variants)?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const qtyId = useId();

  const variant = variants.find((v) => v.id === selectedId) ?? pickDefaultVariant(variants);
  if (!variant) {
    return <p className="text-coffee-700">Sản phẩm hiện chưa có lựa chọn để mua.</p>;
  }

  const outOfStock = variant.stockStatus === "OUT_OF_STOCK";
  const max = Math.max(1, variant.maxQuantity);
  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1));
  const qty = clamp(quantity);
  const compareAt = variant.isOnSale ? variant.price : null;

  return (
    <div className="space-y-4">
      <PriceTag size="lg" price={variant.effectivePrice} compareAtPrice={compareAt} />
      {variant.isOnSale && variant.saleEndsAt ? (
        <p className="text-sm font-medium text-danger-600">
          Sale đến {formatSaleDate(variant.saleEndsAt)}
        </p>
      ) : null}

      {variants.length > 1 ? (
        <VariantSelector
          variants={variants}
          selectedId={variant.id}
          onChange={(id) => {
            setSelectedId(id);
            const next = variants.find((v) => v.id === id);
            setQuantity((q) => Math.min(Math.max(1, next?.maxQuantity ?? 1), q));
          }}
        />
      ) : (
        <p className="text-sm text-coffee-700">{variant.name}</p>
      )}

      <p className={cn("text-sm font-semibold", STOCK_STYLE[variant.stockStatus])} role="status">
        {STOCK_LABELS[variant.stockStatus]}
      </p>
      {variant.roastDate ? (
        <p className="text-sm text-coffee-700">Ngày rang: {formatPlainDate(variant.roastDate)}</p>
      ) : null}

      {!outOfStock ? (
        <div>
          <Label htmlFor={qtyId}>Số lượng</Label>
          <div className="inline-flex items-center rounded-lg border border-coffee-400 bg-white">
            <button
              type="button"
              aria-label="Giảm số lượng"
              disabled={qty <= 1}
              onClick={() => setQuantity(clamp(qty - 1))}
              className="h-11 w-11 text-lg text-coffee-800 disabled:opacity-40"
            >
              −
            </button>
            <input
              id={qtyId}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={qty}
              onChange={(e) => setQuantity(clamp(Number(e.target.value)))}
              className="h-11 w-14 border-x border-coffee-300 text-center text-base text-coffee-900"
            />
            <button
              type="button"
              aria-label="Tăng số lượng"
              disabled={qty >= max}
              onClick={() => setQuantity(clamp(qty + 1))}
              className="h-11 w-11 text-lg text-coffee-800 disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className="mt-1 text-xs text-coffee-600">Tối đa {max} sản phẩm mỗi lần đặt.</p>
        </div>
      ) : null}

      {/* TODO(M3): nối với API giỏ hàng (POST /cart/items) và bỏ disabled ở nhánh còn hàng. */}
      <Button size="lg" disabled className="w-full sm:w-auto sm:min-w-56">
        {outOfStock ? "Hết hàng" : "Thêm vào giỏ"}
      </Button>
      {!outOfStock ? <p className="text-sm text-coffee-600">Giỏ hàng sẽ sớm ra mắt.</p> : null}
    </div>
  );
}
