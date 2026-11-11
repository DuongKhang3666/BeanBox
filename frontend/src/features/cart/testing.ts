import type { Cart, CartItem } from "@/types/cart";

export function makeCartItem(over: Partial<CartItem> = {}): CartItem {
  return {
    id: "ci1",
    variantId: "v1",
    quantity: 2,
    product: {
      id: "p1",
      slug: "robusta-buon-ma-thuot",
      name: "Robusta Buôn Ma Thuột",
      imageUrl: null,
    },
    variant: {
      id: "v1",
      sku: "ROB-500-PHIN",
      name: "500 g - Xay phin",
      attributes: { weight: "500g" },
      weightGram: 500,
    },
    unitPrice: 165000,
    listPrice: 165000,
    lineTotal: 330000,
    unitPriceAtAdd: 165000,
    maxQuantity: 20,
    stockStatus: "IN_STOCK",
    warnings: [],
    ...over,
  };
}

export function makeCart(over: Partial<Cart> = {}): Cart {
  const items = over.items ?? [makeCartItem()];
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  return {
    cartToken: null,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    coupon: null,
    discountTotal: 0,
    totalWeightGram: 1000,
    shippingEstimate: {
      standardFrom: 20000,
      freeShippingThreshold: 500000,
      freeShippingRemaining: Math.max(0, 500000 - subtotal),
    },
    ...over,
  };
}
