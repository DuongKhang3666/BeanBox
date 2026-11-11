/** Máy trạng thái đơn hàng (api-contract §11, #0–#12; v2 #13–#15 chưa cho phép). */

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export type OrderActor = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';

const STAFF_PLUS: readonly OrderActor[] = ['STAFF', 'ADMIN'];

interface Rule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly OrderActor[];
}

const RULES: readonly Rule[] = [
  { from: 'PENDING_PAYMENT', to: 'CONFIRMED', actors: ['SYSTEM'] }, // #1
  { from: 'PENDING_PAYMENT', to: 'CANCELLED', actors: ['SYSTEM', 'CUSTOMER', ...STAFF_PLUS] }, // #2
  { from: 'PENDING', to: 'CONFIRMED', actors: STAFF_PLUS }, // #3
  { from: 'PENDING', to: 'CANCELLED', actors: ['CUSTOMER', ...STAFF_PLUS] }, // #4
  { from: 'CONFIRMED', to: 'PROCESSING', actors: STAFF_PLUS }, // #5
  { from: 'CONFIRMED', to: 'CANCELLED', actors: ['CUSTOMER', ...STAFF_PLUS] }, // #6
  { from: 'PROCESSING', to: 'SHIPPING', actors: STAFF_PLUS }, // #7
  { from: 'PROCESSING', to: 'CANCELLED', actors: STAFF_PLUS }, // #8
  { from: 'SHIPPING', to: 'DELIVERED', actors: STAFF_PLUS }, // #9
  { from: 'SHIPPING', to: 'FAILED_DELIVERY', actors: STAFF_PLUS }, // #10
  { from: 'FAILED_DELIVERY', to: 'SHIPPING', actors: STAFF_PLUS }, // #11
  { from: 'FAILED_DELIVERY', to: 'CANCELLED', actors: STAFF_PLUS }, // #12
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  if (from === to) return false;
  return RULES.some((r) => r.from === from && r.to === to && r.actors.includes(actor));
}

export function allowedTransitions(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return RULES.filter((r) => r.from === from && r.actors.includes(actor)).map((r) => r.to);
}

/** Khách được hủy ở #2, #4, #6. */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return canTransition(status, 'CANCELLED', 'CUSTOMER');
}
