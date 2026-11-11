import type { StockStatus } from "./catalog";

/** Theo docs/api-contract.md §8. Tiền là số nguyên VND. */
export type CartWarning = "PRICE_CHANGED" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK" | "UNAVAILABLE";

export type CouponInvalidReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT"
  | "PER_USER_LIMIT"
  | "MIN_ORDER"
  | "NOT_APPLICABLE";

export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  product: { id: string; slug: string; name: string; imageUrl: string | null };
  variant: {
    id: string;
    sku: string;
    name: string;
    attributes: Record<string, string>;
    weightGram: number | null;
  };
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  unitPriceAtAdd: number;
  maxQuantity: number;
  stockStatus: StockStatus;
  warnings: CartWarning[];
}

export interface CartCoupon {
  code: string;
  type: string;
  discount: number;
  valid: boolean;
  invalidReason: CouponInvalidReason | null;
  /** Chỉ có khi invalidReason = "MIN_ORDER" (VND, số nguyên). */
  minOrder?: number;
}

export interface Cart {
  /** Chỉ có giá trị khi server vừa cấp token mới cho giỏ guest. */
  cartToken: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  coupon: CartCoupon | null;
  discountTotal: number;
  totalWeightGram: number;
  shippingEstimate: {
    standardFrom: number;
    freeShippingThreshold: number;
    freeShippingRemaining: number;
  };
}

export type MergeAdjustmentReason = "QUANTITY_LIMIT" | "STOCK_LIMIT" | "UNAVAILABLE";

export interface MergeMeta {
  merged: boolean;
  adjustments: {
    variantId: string;
    requested: number;
    final: number;
    reason: MergeAdjustmentReason;
  }[];
}
