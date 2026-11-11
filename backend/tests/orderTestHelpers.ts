import { expect } from 'vitest';
import { DANANG, dataOf, type createFixtures, type Who } from './checkoutHelpers.js';

type Fx = ReturnType<typeof createFixtures>;

/** Đặt đơn guest COD thật qua API. Trả { order (DTO), who }. */
export async function placeGuestOrder(
  fx: Fx,
  lines: Array<[string, number]>,
  over: Record<string, unknown> = {},
  phone = '+84 90 123 4567',
) {
  const who = await fx.guestWith(lines);
  const body = fx.guestOrderBody({ contact: { email: fx.nextEmail(), phone }, ...over });
  const res = await fx.postOrder(who, body);
  expect(res.status).toBe(201);
  return { order: dataOf(res), who };
}

/** Đặt đơn COD của user đã đăng nhập qua API (địa chỉ lưu sẵn, SĐT 0912345678). */
export async function placeUserOrder(
  fx: Fx,
  user: { id: string; who: Who },
  lines: Array<[string, number]>,
) {
  const addr = await fx.mkAddress(user.id, DANANG, { phone: '0912345678' });
  for (const [variantId, qty] of lines) {
    expect((await fx.add(user.who, variantId, qty)).status).toBe(201);
  }
  const res = await fx.postOrder(user.who, {
    addressId: addr.id,
    shippingMethod: 'STANDARD',
    paymentMethod: 'COD',
    acceptTerms: true,
  });
  expect(res.status).toBe(201);
  return dataOf(res);
}
