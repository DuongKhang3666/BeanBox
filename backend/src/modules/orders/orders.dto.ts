import type { Prisma } from '@prisma/client';
import { getPaymentConfig, isProviderEnabled, type PaymentConfig } from '../../config/payments.js';
import { isCustomerCancellable } from '../../lib/orderStateMachine.js';

/** Order DTO (api-contract §9). Không lộ idempotencyKey, requestFingerprint, userId, couponId, actorId. */

export const orderInclude = {
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  line1: string;
}

export interface OrderItemDto {
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

export interface OrderHistoryDto {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

export interface OrderDto {
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  contact: { email: string; phone: string };
  shippingAddress: ShippingAddressSnapshot;
  items: OrderItemDto[];
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
  history: OrderHistoryDto[];
  canCancel: boolean;
  canPay: boolean;
}

export interface DtoOptions {
  /** Cấu hình thanh toán dùng tính `canPay` (mặc định đọc từ env). */
  paymentConfig?: PaymentConfig;
  now?: Date;
}

/** `canPay` (api-contract §13.1): PENDING_PAYMENT, còn hạn, phương thức của đơn đang bật. */
export function computeCanPay(
  o: Pick<OrderWithRelations, 'status' | 'expiresAt' | 'paymentMethod'>,
  opts: DtoOptions = {},
): boolean {
  const now = opts.now ?? new Date();
  return (
    o.status === 'PENDING_PAYMENT' &&
    o.expiresAt !== null &&
    o.expiresAt.getTime() > now.getTime() &&
    isProviderEnabled(opts.paymentConfig ?? getPaymentConfig(), o.paymentMethod)
  );
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toShippingAddress(raw: Prisma.JsonValue): ShippingAddressSnapshot {
  const a = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === 'string' ? a[k] : '');
  return {
    fullName: str('fullName'),
    phone: str('phone'),
    provinceCode: str('provinceCode'),
    provinceName: str('provinceName'),
    wardCode: str('wardCode'),
    wardName: str('wardName'),
    line1: str('line1'),
  };
}

export function toOrderDto(o: OrderWithRelations, opts: DtoOptions = {}): OrderDto {
  return {
    code: o.code,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    contact: { email: o.contactEmail, phone: o.contactPhone },
    shippingAddress: toShippingAddress(o.shippingAddress),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      imageUrl: i.imageUrl,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    shippingDiscount: o.shippingDiscount,
    grandTotal: o.grandTotal,
    couponCode: o.couponCode,
    note: o.note,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    cancelReason: o.cancelReason,
    expiresAt: iso(o.expiresAt),
    paidAt: iso(o.paidAt),
    deliveredAt: iso(o.deliveredAt),
    createdAt: o.createdAt.toISOString(),
    history: o.history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    canCancel: isCustomerCancellable(o.status),
    canPay: computeCanPay(o, opts),
  };
}

// ---------------------------------------------------------------------------
// Tra cứu công khai (api-contract §9.5): chỉ các trường được liệt kê, không dữ liệu cá nhân.

export interface TrackedOrderDto {
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  shippingAddress: { provinceName: string; wardName: string };
  items: Array<{
    productName: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  grandTotal: number;
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
  /** Hạn thanh toán (ISO) hoặc null; không phải dữ liệu cá nhân (0.6.1). */
  expiresAt: string | null;
  createdAt: string;
  history: Array<{ fromStatus: string | null; toStatus: string; createdAt: string }>;
  canCancel: boolean;
  canPay: boolean;
}

export function toTrackedOrderDto(o: OrderWithRelations, opts: DtoOptions = {}): TrackedOrderDto {
  const addr = toShippingAddress(o.shippingAddress);
  return {
    code: o.code,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    shippingAddress: { provinceName: addr.provinceName, wardName: addr.wardName },
    items: o.items.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      imageUrl: i.imageUrl,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    shippingDiscount: o.shippingDiscount,
    grandTotal: o.grandTotal,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    cancelReason: o.cancelReason,
    expiresAt: iso(o.expiresAt),
    createdAt: o.createdAt.toISOString(),
    history: o.history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      createdAt: h.createdAt.toISOString(),
    })),
    // Chỉ đơn guest: user phải đăng nhập mới hủy được (quy tắc §9.4).
    canCancel: o.userId === null && isCustomerCancellable(o.status),
    // §13.1: tra cứu chỉ cho thanh toán đơn guest.
    canPay: o.userId === null && computeCanPay(o, opts),
  };
}
