import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, DANANG, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm3q-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

const quote = (who: Who, body: Record<string, unknown>) =>
  fx.call('post', '/checkout/quote', who, body);

beforeAll(async () => {
  app = createApp({
    generalRateLimit: 100_000,
    authRateLimit: 100_000,
    couponRateLimit: 100_000,
    quoteRateLimit: 100_000,
    orderRateLimit: 100_000,
  });
  await fx.setup();
});
afterAll(async () => {
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.innerCityProvinceCodes', ['01', '79']);
  await fx.setSetting('shipping.innerCityWardCodes', []);
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
  await fx.setSetting('shipping.weightSurcharge', {
    freeGram: 2000,
    stepGram: 1000,
    feePerStep: 5000,
  });
});
afterEach(async () => {
  await fx.restoreSettings();
});

describe('POST /checkout/quote', () => {
  it('vùng INNER (TP.HCM) và OTHER (tỉnh khác); trả đủ shape §9.1', async () => {
    const v = await fx.mkVariant('zone', { price: 100000 });
    const who = await fx.guestWith([[v.id, 2]]);

    const inner = await quote(who, { provinceCode: '79' });
    expect(inner.status).toBe(200);
    const d = dataOf(inner);
    expect(d.shippingZone).toBe('INNER');
    expect(d.subtotal).toBe(200000);
    expect(d.discountTotal).toBe(0);
    expect(d.coupon).toBeNull();
    expect(d.totalWeightGram).toBe(1000);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ variantId: v.id, quantity: 2, lineTotal: 200000 });
    expect(d.shippingOptions.map((o: { method: string }) => o.method)).toEqual([
      'STANDARD',
      'EXPRESS',
    ]);
    expect(d.shippingOptions[0]).toMatchObject({
      baseFee: 20000,
      fee: 20000,
      payableFee: 20000,
      grandTotal: 220000,
    });
    expect(d.shippingOptions[1]).toMatchObject({ baseFee: 35000, grandTotal: 235000 });
    expect(d.paymentMethods).toEqual([
      { method: 'COD', enabled: true },
      { method: 'VNPAY', enabled: false },
      { method: 'STRIPE', enabled: false },
    ]);
    expect(d.issues).toEqual([]);

    const other = await quote(who, { provinceCode: DANANG.provinceCode });
    expect(dataOf(other).shippingZone).toBe('OTHER');
    expect(dataOf(other).shippingOptions[0]).toMatchObject({ baseFee: 35000, grandTotal: 235000 });
  });

  it('wardCode thuộc innerCityWardCodes -> INNER dù tỉnh không nằm trong danh sách', async () => {
    await fx.setSetting('shipping.innerCityWardCodes', [DANANG.wardCode]);
    const v = await fx.mkVariant('ward');
    const who = await fx.guestWith([[v.id, 1]]);
    expect(dataOf(await quote(who, { ...DANANG })).shippingZone).toBe('INNER');
    expect(dataOf(await quote(who, { provinceCode: DANANG.provinceCode })).shippingZone).toBe(
      'OTHER',
    );
  });

  it('addressId: lấy tỉnh/phường từ địa chỉ; địa chỉ người khác 404; guest 401', async () => {
    const owner = await fx.mkUser('q-owner');
    const other = await fx.mkUser('q-other');
    const addr = await fx.mkAddress(owner.id, DANANG);
    const v = await fx.mkVariant('addr');
    await fx.add(owner.who, v.id, 1);

    const ok = await quote(owner.who, { addressId: addr.id });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).shippingZone).toBe('OTHER');

    await fx.add(other.who, v.id, 1);
    const stolen = await quote(other.who, { addressId: addr.id });
    expect(stolen.status).toBe(404);
    expect(errOf(stolen).code).toBe('NOT_FOUND');

    const guest = await fx.guestWith([[v.id, 1]]);
    const g = await quote(guest, { addressId: addr.id });
    expect(g.status).toBe(401);
    expect(errOf(g).code).toBe('UNAUTHORIZED');
  });

  it('validate địa điểm: thiếu tỉnh, tỉnh lạ, phường không thuộc tỉnh', async () => {
    const v = await fx.mkVariant('val');
    const who = await fx.guestWith([[v.id, 1]]);

    const missing = await quote(who, {});
    expect(missing.status).toBe(400);
    expect(errOf(missing).details).toEqual([expect.objectContaining({ field: 'provinceCode' })]);

    const badProvince = await quote(who, { provinceCode: '99' });
    expect(badProvince.status).toBe(400);
    expect(errOf(badProvince).details).toEqual([
      expect.objectContaining({ field: 'provinceCode', message: 'Tỉnh/thành không tồn tại' }),
    ]);

    const mismatch = await quote(who, { provinceCode: '79', wardCode: DANANG.wardCode });
    expect(mismatch.status).toBe(400);
    expect(errOf(mismatch).details).toEqual([expect.objectContaining({ field: 'wardCode' })]);

    expect((await quote(who, { provinceCode: '7' })).status).toBe(400);
  });

  it('CART_EMPTY: không có giỏ, giỏ guest không token, giỏ 0 dòng', async () => {
    expect(errOf(await quote({}, { provinceCode: '79' })).code).toBe('CART_EMPTY');
    const u = await fx.mkUser('q-empty');
    const res = await quote(u.who, { provinceCode: '79' });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CART_EMPTY');
    const v = await fx.mkVariant('empty');
    await fx.add(u.who, v.id, 1);
    await fx.call('delete', '/cart', u.who);
    expect(errOf(await quote(u.who, { provinceCode: '79' })).code).toBe('CART_EMPTY');
  });

  it('issues: hết hàng, thiếu hàng, ngừng bán (available = tồn thực, 0 khi ngừng bán)', async () => {
    const oos = await fx.mkVariant('oos', { stock: 5 });
    const low = await fx.mkVariant('low', { stock: 5 });
    const off = await fx.mkVariant('off', { stock: 5 });
    const fine = await fx.mkVariant('fine', { stock: 5 });
    const who = await fx.guestWith([
      [oos.id, 2],
      [low.id, 4],
      [off.id, 1],
      [fine.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: oos.id }, data: { stock: 0 } });
    await prisma.productVariant.update({ where: { id: low.id }, data: { stock: 2 } });
    await prisma.productVariant.update({ where: { id: off.id }, data: { isActive: false } });

    const res = await quote(who, { provinceCode: '79' });
    expect(res.status).toBe(200);
    const issues = dataOf(res).issues as Array<{
      variantId: string;
      type: string;
      available: number;
    }>;
    const by = (id: string) => issues.find((i) => i.variantId === id);
    expect(by(oos.id)).toEqual({ variantId: oos.id, type: 'OUT_OF_STOCK', available: 0 });
    expect(by(low.id)).toEqual({ variantId: low.id, type: 'INSUFFICIENT_STOCK', available: 2 });
    expect(by(off.id)).toEqual({ variantId: off.id, type: 'UNAVAILABLE', available: 0 });
    expect(by(fine.id)).toBeUndefined();
    expect(issues).toHaveLength(3);
  });

  it('couponCode body ghi đè mã trong giỏ; mã sai -> valid:false, quote vẫn 200', async () => {
    const inCart = await fx.mkCoupon('incart', { type: 'PERCENT', value: 10 });
    const override = await fx.mkCoupon('over', { type: 'FIXED', value: 30000 });
    const v = await fx.mkVariant('coupon', { price: 100000 });
    const who = await fx.guestWith([[v.id, 2]]);
    expect((await fx.call('post', '/cart/apply-coupon', who, { code: inCart.code })).status).toBe(
      200,
    );

    const base = dataOf(await quote(who, { provinceCode: '79' }));
    expect(base.coupon).toMatchObject({ code: inCart.code, valid: true, discount: 20000 });
    expect(base.discountTotal).toBe(20000);

    const over = dataOf(
      await quote(who, { provinceCode: '79', couponCode: override.code.toLowerCase() }),
    );
    expect(over.coupon).toMatchObject({ code: override.code, valid: true, discount: 30000 });
    expect(over.discountTotal).toBe(30000);
    expect(over.shippingOptions[0].grandTotal).toBe(200000 - 30000 + 20000);

    const bad = await quote(who, { provinceCode: '79', couponCode: 'KHONGTONTAI' });
    expect(bad.status).toBe(200);
    expect(dataOf(bad).coupon).toMatchObject({
      valid: false,
      invalidReason: 'NOT_FOUND',
      discount: 0,
    });
    expect(dataOf(bad).discountTotal).toBe(0);
  });

  it('phụ phí khối lượng: 4500 g -> vượt 2500 g -> 3 bậc x 5.000', async () => {
    const v = await fx.mkVariant('heavy', { price: 50000, weightGram: 1500 });
    const who = await fx.guestWith([[v.id, 3]]);
    const d = dataOf(await quote(who, { provinceCode: '79' }));
    expect(d.totalWeightGram).toBe(4500);
    expect(d.shippingOptions[0]).toMatchObject({
      baseFee: 20000,
      weightSurcharge: 15000,
      fee: 35000,
    });
    expect(d.shippingOptions[1]).toMatchObject({
      baseFee: 35000,
      weightSurcharge: 15000,
      fee: 50000,
    });
  });

  it('freeship theo ngưỡng chỉ áp cho STANDARD', async () => {
    const v = await fx.mkVariant('free', { price: 300000 });
    const who = await fx.guestWith([[v.id, 2]]);
    const d = dataOf(await quote(who, { provinceCode: '79' }));
    expect(d.shippingOptions[0]).toMatchObject({
      method: 'STANDARD',
      freeShippingApplied: true,
      shippingDiscount: 20000,
      payableFee: 0,
      grandTotal: 600000,
    });
    expect(d.shippingOptions[1]).toMatchObject({
      method: 'EXPRESS',
      freeShippingApplied: false,
      payableFee: 35000,
      grandTotal: 635000,
    });
  });

  it('perUserLimit của guest được kiểm theo contactEmail', async () => {
    const c = await fx.mkCoupon('pu', { perUserLimit: 1 });
    const v = await fx.mkVariant('pu', { stock: 10 });
    const who = await fx.guestWith([[v.id, 1]]);
    const email = fx.nextEmail();
    await fx.call('post', '/cart/apply-coupon', who, { code: c.code });
    const placed = await fx.postOrder(
      who,
      fx.guestOrderBody({ contact: { email, phone: '0901234567' }, couponCode: c.code }),
    );
    expect(placed.status).toBe(201);

    const v2 = await fx.mkVariant('pu2', { stock: 10 });
    const who2 = await fx.guestWith([[v2.id, 1]]);
    const same = await quote(who2, { provinceCode: '79', couponCode: c.code, contactEmail: email });
    expect(dataOf(same).coupon).toMatchObject({ valid: false, invalidReason: 'PER_USER_LIMIT' });
    const fresh = await quote(who2, {
      provinceCode: '79',
      couponCode: c.code,
      contactEmail: fx.nextEmail(),
    });
    expect(dataOf(fresh).coupon).toMatchObject({ valid: true });
  });

  it('quote chỉ đọc: không đổi tồn kho, mã, giỏ, đơn', async () => {
    const c = await fx.mkCoupon('ro');
    const v = await fx.mkVariant('ro', { stock: 7 });
    const who = await fx.guestWith([[v.id, 2]]);
    await fx.call('post', '/cart/apply-coupon', who, { code: c.code });
    const snap = async () => ({
      stock: (await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock,
      used: (await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount,
      cart: await prisma.cart.findFirstOrThrow({ where: { items: { some: { variantId: v.id } } } }),
      orders: await prisma.order.count({ where: { items: { some: { variantId: v.id } } } }),
      movements: await prisma.inventoryMovement.count({ where: { variantId: v.id } }),
    });
    const before = await snap();
    const res = await quote(who, { provinceCode: '79', couponCode: c.code });
    expect(res.status).toBe(200);
    expect(await snap()).toEqual(before);
    expect(before.cart.couponCode).toBe(c.code);
  });
});
