/** Quy tắc giá hiệu lực (api-contract §10.1). Tiền là số nguyên VND. */

export interface PricedVariant {
  price: number;
  salePrice: number | null;
  saleStart: Date | null;
  saleEnd: Date | null;
}

/** Đang sale khi có salePrice và `now` nằm trong [saleStart, saleEnd] (bound null = mở, biên tính cả hai đầu). */
export function isOnSale(v: PricedVariant, now: Date): boolean {
  if (v.salePrice == null) return false;
  const t = now.getTime();
  if (v.saleStart != null && t < v.saleStart.getTime()) return false;
  if (v.saleEnd != null && t > v.saleEnd.getTime()) return false;
  return true;
}

export function effectivePrice(v: PricedVariant, now: Date): number {
  return isOnSale(v, now) && v.salePrice != null ? v.salePrice : v.price;
}

/**
 * Giá thấp nhất trong các variant và giá niêm yết của variant đạt mức đó nếu đang sale.
 * Không có variant -> minPrice 0, compareAtPrice null.
 */
export function summarizePrices(
  variants: readonly PricedVariant[],
  now: Date,
): { minPrice: number; compareAtPrice: number | null } {
  if (variants.length === 0) return { minPrice: 0, compareAtPrice: null };
  const minPrice = Math.min(...variants.map((v) => effectivePrice(v, now)));
  const onSaleAtMin = variants.find((v) => isOnSale(v, now) && effectivePrice(v, now) === minPrice);
  return { minPrice, compareAtPrice: onSaleAtMin ? onSaleAtMin.price : null };
}
