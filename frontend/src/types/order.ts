import type { CartCoupon, CartItem } from "./cart";

/** Theo docs/api-contract.md §9, §11. Tiền là số nguyên VND. */
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED";

export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";
export type PaymentMethod = "COD" | "VNPAY" | "STRIPE";
export type ShippingMethod = "STANDARD" | "EXPRESS";

export interface OrderShippingAddress {
  fullName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  line1: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderHistoryEntry {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note?: string | null;
  createdAt: string;
}

export interface Order {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  shippingMethod: ShippingMethod;
  contact: { email: string; phone: string };
  shippingAddress: OrderShippingAddress;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  grandTotal: number;
  couponCode: string | null;
  note: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  history: OrderHistoryEntry[];
  canCancel: boolean;
  /** §13.1: đang chờ thanh toán, còn hạn và phương thức còn bật. */
  canPay: boolean;
}

/** §6.4 */
export interface OrderListItem {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  grandTotal: number;
  itemCount: number;
  createdAt: string;
  items: { productName: string; variantName: string; imageUrl: string | null; quantity: number }[];
}

/** §9.5 (rút gọn dữ liệu cá nhân) + canCancel, cancelReason. */
export interface TrackedOrder {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  shippingMethod: ShippingMethod;
  shippingAddress: { provinceName: string; wardName: string };
  items: {
    productName: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  grandTotal: number;
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
  createdAt: string;
  history: OrderHistoryEntry[];
  canCancel: boolean;
  /** §13.1 (chỉ đơn guest). */
  canPay: boolean;
  /** §9.5 (0.6.1): hạn thanh toán, null khi không áp dụng; không phải dữ liệu cá nhân. */
  expiresAt: string | null;
}

/** §9.1 */
export interface ShippingOption {
  method: ShippingMethod;
  label: string;
  estimatedDays: string;
  baseFee: number;
  weightSurcharge: number;
  fee: number;
  freeShippingApplied: boolean;
  shippingDiscount: number;
  payableFee: number;
  grandTotal: number;
}

export interface PaymentOption {
  method: PaymentMethod;
  enabled: boolean;
}

export interface QuoteIssue {
  variantId: string;
  type: "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "UNAVAILABLE";
  available?: number;
}

export interface Quote {
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  coupon: CartCoupon | null;
  totalWeightGram: number;
  shippingZone: "INNER" | "OTHER";
  shippingOptions: ShippingOption[];
  paymentMethods: PaymentOption[];
  issues: QuoteIssue[];
}

export interface QuoteRequest {
  addressId?: string;
  provinceCode?: string;
  wardCode?: string;
  contactEmail?: string;
}

/** §9.2 */
export interface PlaceOrderRequest {
  contact?: { email?: string; phone?: string };
  addressId?: string;
  shippingAddress?: {
    fullName: string;
    phone: string;
    provinceCode: string;
    wardCode: string;
    line1: string;
  };
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  note?: string;
  acceptTerms: true;
  expectedTotal?: number;
}
