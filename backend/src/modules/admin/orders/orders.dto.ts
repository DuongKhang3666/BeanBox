import type { Prisma } from '@prisma/client';
import { allowedTransitions, type OrderActor } from '../../../lib/orderStateMachine.js';
import {
  toShippingAddress,
  type OrderDto,
  type ShippingAddressSnapshot,
} from '../../orders/orders.dto.js';

/** AdminOrder (api-contract §12.1). Không lộ idempotencyKey, requestFingerprint, couponId. */

export const adminOrderInclude = {
  items: { orderBy: { id: 'asc' } },
  history: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { id: true, fullName: true, role: true } } },
  },
  user: { select: { id: true, email: true, fullName: true } },
  // Không chọn rawPayload: không bao giờ trả ra API (§13.7).
  payments: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      provider: true,
      amount: true,
      status: true,
      providerTxnId: true,
      providerRef: true,
      createdAt: true,
      updatedAt: true,
      refundedAt: true,
      refundNote: true,
    },
  },
} satisfies Prisma.OrderInclude;

export type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>;

export interface AdminPaymentDto {
  id: string;
  provider: string;
  amount: number;
  status: string;
  providerTxnId: string | null;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
  refundedAt: string | null;
  refundNote: string | null;
  needsRefund: boolean;
}

/**
 * `needsRefund` (§13.7): Payment SUCCEEDED VÀ (đơn CANCELLED HOẶC đã có Payment SUCCEEDED khác
 * tạo trước nó). Hòa về thời gian thì xét theo id.
 */
export function paymentNeedsRefund(
  orderStatus: string,
  payment: { id: string; status: string; createdAt: Date },
  all: ReadonlyArray<{ id: string; status: string; createdAt: Date }>,
): boolean {
  if (payment.status !== 'SUCCEEDED') return false;
  if (orderStatus === 'CANCELLED') return true;
  return all.some(
    (o) =>
      o.id !== payment.id &&
      o.status === 'SUCCEEDED' &&
      (o.createdAt.getTime() < payment.createdAt.getTime() ||
        (o.createdAt.getTime() === payment.createdAt.getTime() && o.id < payment.id)),
  );
}

export interface AdminOrderDto extends Omit<OrderDto, 'canCancel' | 'canPay' | 'history'> {
  id: string;
  isGuest: boolean;
  customer: { id: string; email: string; fullName: string } | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  totalWeightGram: number;
  history: Array<{
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    actor: { id: string; fullName: string; role: string } | null;
  }>;
  allowedTransitions: string[];
  payments: AdminPaymentDto[];
  needsRefund: boolean;
}

export interface AdminOrderListItemDto {
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingMethod: string;
  customerName: string;
  contactPhone: string;
  contactEmail: string;
  isGuest: boolean;
  provinceName: string;
  grandTotal: number;
  itemCount: number;
  createdAt: string;
  needsRefund: boolean;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const V2_TARGETS = new Set(['RETURN_REQUESTED', 'RETURNED']);

export function toAdminOrderDto(o: AdminOrderRow, role: OrderActor): AdminOrderDto {
  const addr: ShippingAddressSnapshot = toShippingAddress(o.shippingAddress);
  const payments: AdminPaymentDto[] = o.payments.map((p) => ({
    id: p.id,
    provider: p.provider,
    amount: p.amount,
    status: p.status,
    providerTxnId: p.providerTxnId,
    providerRef: p.providerRef,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    refundedAt: iso(p.refundedAt),
    refundNote: p.refundNote,
    needsRefund: paymentNeedsRefund(o.status, p, o.payments),
  }));
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    isGuest: o.userId === null,
    customer: o.user ? { id: o.user.id, email: o.user.email, fullName: o.user.fullName } : null,
    contact: { email: o.contactEmail, phone: o.contactPhone },
    shippingAddress: addr,
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
    totalWeightGram: o.totalWeightGram,
    expiresAt: iso(o.expiresAt),
    paidAt: iso(o.paidAt),
    confirmedAt: iso(o.confirmedAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    history: o.history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
      actor: h.actor ? { id: h.actor.id, fullName: h.actor.fullName, role: h.actor.role } : null,
    })),
    allowedTransitions: allowedTransitions(o.status, role).filter((s) => !V2_TARGETS.has(s)),
    payments,
    needsRefund: payments.some((p) => p.needsRefund),
  };
}

export function toAdminOrderListItem(
  o: {
    code: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    shippingMethod: string;
    contactPhone: string;
    contactEmail: string;
    userId: string | null;
    shippingAddress: Prisma.JsonValue;
    grandTotal: number;
    createdAt: Date;
  },
  itemCount: number,
  needsRefund = false,
): AdminOrderListItemDto {
  const addr = toShippingAddress(o.shippingAddress);
  return {
    code: o.code,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    customerName: addr.fullName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    isGuest: o.userId === null,
    provinceName: addr.provinceName,
    grandTotal: o.grandTotal,
    itemCount,
    createdAt: o.createdAt.toISOString(),
    needsRefund,
  };
}
