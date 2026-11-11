import type { Order, OrderListItem, Quote, ShippingOption, TrackedOrder } from "@/types/order";
import { makeCartItem } from "../cart/testing";

export function makeShippingOption(over: Partial<ShippingOption> = {}): ShippingOption {
  return {
    method: "STANDARD",
    label: "Tiêu chuẩn",
    estimatedDays: "3-5",
    baseFee: 20000,
    weightSurcharge: 0,
    fee: 20000,
    freeShippingApplied: false,
    shippingDiscount: 0,
    payableFee: 20000,
    grandTotal: 350000,
    ...over,
  };
}

/** Quote cho giỏ mặc định (2 x 165.000 = 330.000). STANDARD 350.000, EXPRESS 365.000. */
export function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    items: [makeCartItem()],
    subtotal: 330000,
    discountTotal: 0,
    coupon: null,
    totalWeightGram: 1000,
    shippingZone: "INNER",
    shippingOptions: [
      makeShippingOption(),
      makeShippingOption({
        method: "EXPRESS",
        label: "Nhanh",
        estimatedDays: "1-2",
        baseFee: 35000,
        fee: 35000,
        payableFee: 35000,
        grandTotal: 365000,
      }),
    ],
    paymentMethods: [
      { method: "COD", enabled: true },
      { method: "VNPAY", enabled: false },
      { method: "STRIPE", enabled: false },
    ],
    issues: [],
    ...over,
  };
}

export function makeOrder(over: Partial<Order> = {}): Order {
  return {
    code: "BB-261110-K7QP",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "COD",
    shippingMethod: "STANDARD",
    contact: { email: "an@example.com", phone: "0901234567" },
    shippingAddress: {
      fullName: "Nguyễn Văn An",
      phone: "0901234567",
      provinceCode: "79",
      provinceName: "Thành phố Hồ Chí Minh",
      wardCode: "26740",
      wardName: "Phường Sài Gòn",
      line1: "12 Lê Lợi",
    },
    items: [
      {
        id: "oi1",
        productId: "p1",
        variantId: "v1",
        productName: "Robusta Buôn Ma Thuột",
        variantName: "500 g - Xay phin",
        sku: "ROB-500-PHIN",
        imageUrl: null,
        unitPrice: 165000,
        quantity: 2,
        lineTotal: 330000,
      },
    ],
    subtotal: 330000,
    discountTotal: 0,
    shippingFee: 20000,
    shippingDiscount: 0,
    grandTotal: 350000,
    couponCode: null,
    note: null,
    trackingNumber: null,
    carrier: null,
    cancelReason: null,
    expiresAt: null,
    paidAt: null,
    deliveredAt: null,
    createdAt: "2026-11-10T08:30:00.000Z",
    history: [
      { fromStatus: null, toStatus: "PENDING", note: null, createdAt: "2026-11-10T08:30:00.000Z" },
    ],
    canCancel: true,
    canPay: false,
    ...over,
  };
}

export function makeTrackedOrder(over: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    code: "BB-261110-K7QP",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "COD",
    shippingMethod: "STANDARD",
    shippingAddress: { provinceName: "Thành phố Hồ Chí Minh", wardName: "Phường Sài Gòn" },
    items: [
      {
        productName: "Robusta Buôn Ma Thuột",
        variantName: "500 g - Xay phin",
        imageUrl: null,
        unitPrice: 165000,
        quantity: 2,
        lineTotal: 330000,
      },
    ],
    subtotal: 330000,
    discountTotal: 0,
    shippingFee: 20000,
    shippingDiscount: 0,
    grandTotal: 350000,
    trackingNumber: null,
    carrier: null,
    cancelReason: null,
    expiresAt: null,
    createdAt: "2026-11-10T08:30:00.000Z",
    history: [{ fromStatus: null, toStatus: "PENDING", createdAt: "2026-11-10T08:30:00.000Z" }],
    canCancel: true,
    canPay: false,
    ...over,
  };
}

export function makeOrderListItem(over: Partial<OrderListItem> = {}): OrderListItem {
  return {
    code: "BB-261110-K7QP",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "COD",
    grandTotal: 350000,
    itemCount: 2,
    createdAt: "2026-11-10T08:30:00.000Z",
    items: [
      {
        productName: "Robusta Buôn Ma Thuột",
        variantName: "500 g - Xay phin",
        imageUrl: null,
        quantity: 2,
      },
    ],
    ...over,
  };
}
