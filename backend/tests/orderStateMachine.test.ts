import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  isCustomerCancellable,
  type OrderActor,
  type OrderStatus,
} from '../src/lib/orderStateMachine.js';

const STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPING',
  'DELIVERED',
  'FAILED_DELIVERY',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
];
const ACTORS: OrderActor[] = ['CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM'];

/** Bảng kỳ vọng viết độc lập với cài đặt: [từ, đến, các actor được phép]. */
const TABLE: [OrderStatus, OrderStatus, OrderActor[]][] = [
  ['PENDING_PAYMENT', 'CONFIRMED', ['SYSTEM']],
  ['PENDING_PAYMENT', 'CANCELLED', ['SYSTEM', 'CUSTOMER', 'STAFF', 'ADMIN']],
  ['PENDING', 'CONFIRMED', ['STAFF', 'ADMIN']],
  ['PENDING', 'CANCELLED', ['CUSTOMER', 'STAFF', 'ADMIN']],
  ['CONFIRMED', 'PROCESSING', ['STAFF', 'ADMIN']],
  ['CONFIRMED', 'CANCELLED', ['CUSTOMER', 'STAFF', 'ADMIN']],
  ['PROCESSING', 'SHIPPING', ['STAFF', 'ADMIN']],
  ['PROCESSING', 'CANCELLED', ['STAFF', 'ADMIN']],
  ['SHIPPING', 'DELIVERED', ['STAFF', 'ADMIN']],
  ['SHIPPING', 'FAILED_DELIVERY', ['STAFF', 'ADMIN']],
  ['FAILED_DELIVERY', 'SHIPPING', ['STAFF', 'ADMIN']],
  ['FAILED_DELIVERY', 'CANCELLED', ['STAFF', 'ADMIN']],
];

describe('canTransition: toàn bộ ma trận', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const actor of ACTORS) {
        const rule = TABLE.find(([f, t]) => f === from && t === to);
        const expected = rule ? rule[2].includes(actor) : false;
        it(`${from} -> ${to} bởi ${actor} = ${expected}`, () => {
          expect(canTransition(from, to, actor)).toBe(expected);
        });
      }
    }
  }
});

describe('quy tắc nổi bật', () => {
  it('cùng trạng thái -> false', () => {
    for (const s of STATUSES) for (const a of ACTORS) expect(canTransition(s, s, a)).toBe(false);
  });
  it('khách chỉ hủy được từ PENDING_PAYMENT/PENDING/CONFIRMED', () => {
    const cancellable = STATUSES.filter((s) => canTransition(s, 'CANCELLED', 'CUSTOMER'));
    expect(cancellable).toEqual(['PENDING_PAYMENT', 'PENDING', 'CONFIRMED']);
    expect(STATUSES.filter(isCustomerCancellable)).toEqual(cancellable);
  });
  it('PROCESSING -> CANCELLED chỉ Staff+', () => {
    expect(canTransition('PROCESSING', 'CANCELLED', 'CUSTOMER')).toBe(false);
    expect(canTransition('PROCESSING', 'CANCELLED', 'SYSTEM')).toBe(false);
    expect(canTransition('PROCESSING', 'CANCELLED', 'STAFF')).toBe(true);
  });
  it('v2 (đổi/trả) bị chặn với mọi actor', () => {
    for (const a of ACTORS) {
      expect(canTransition('DELIVERED', 'RETURN_REQUESTED', a)).toBe(false);
      expect(canTransition('RETURN_REQUESTED', 'RETURNED', a)).toBe(false);
      expect(canTransition('RETURN_REQUESTED', 'DELIVERED', a)).toBe(false);
    }
  });
  it('trạng thái cuối không đi tiếp', () => {
    for (const a of ACTORS) {
      expect(allowedTransitions('CANCELLED', a)).toEqual([]);
      expect(allowedTransitions('RETURNED', a)).toEqual([]);
    }
  });
  it('allowedTransitions', () => {
    expect(allowedTransitions('PENDING', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('PROCESSING', 'CUSTOMER')).toEqual([]);
    expect(allowedTransitions('PENDING', 'STAFF')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(allowedTransitions('FAILED_DELIVERY', 'ADMIN')).toEqual(['SHIPPING', 'CANCELLED']);
  });
});
