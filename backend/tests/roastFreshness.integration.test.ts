import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  addItem,
  getCart,
  reorderLines,
  type CartIdentity,
} from '../src/modules/cart/cart.service.js';
import { getQuote } from '../src/modules/checkout/checkout.service.js';
import { placeOrder } from '../src/modules/orders/orders.service.js';
import { createOrderSchema } from '../src/modules/orders/orders.schema.js';
import { createFixtures, DANANG, dataOf, errOf } from './checkoutHelpers.js';

const PREFIX = 'tr24a-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

/** Đồng hồ tiêm: ngày rang cố định 2030-01-01 (cột DATE), tuổi tính theo ngày VN. */
const ROAST = new Date('2030-01-01T00:00:00.000Z');
const D59 = new Date('2030-03-01T05:00:00Z'); // 59 ngày: quá khuyến nghị, còn bán
const D90 = new Date('2030-04-01T16:59:59Z'); // 90 ngày: ngày cuối còn bán
const D91 = new Date('2030-04-01T17:00:00Z'); // 91 ngày: ngừng bán

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
  await fx.clean();
  await prisma.$disconnect();
});

describe('độ tươi hạt qua API (D-082)', () => {
  it('lô rang quá hạn: thêm giỏ bị từ chối 409 ITEM_UNAVAILABLE + reason ROAST_EXPIRED; null và lô mới thì được', async () => {
    const expired = await fx.mkVariant('old', { roastDate: new Date('2000-01-01T00:00:00Z') });
    const noDate = await fx.mkVariant('nodate', { roastDate: null });
    const fresh = await fx.mkVariant('fresh', { roastDate: new Date('2999-01-01T00:00:00Z') });

    const bad = await fx.add({}, expired.id, 1);
    expect(bad.status).toBe(409);
    expect(errOf(bad).code).toBe('ITEM_UNAVAILABLE');
    expect(errOf(bad).message).toContain('quá hạn rang');
    expect(errOf(bad).details).toMatchObject({ reason: 'ROAST_EXPIRED' });

    const a = await fx.add({}, noDate.id, 1);
    expect(a.status).toBe(201);
    const line = dataOf(a).items[0];
    expect(line.roastStatus).toBeNull();
    expect(line.roastAgeDays).toBeNull();
    const b = await fx.add({ token: dataOf(a).cartToken }, fresh.id, 1);
    expect(b.status).toBe(201);
  });

  it('chi tiết sản phẩm: variant quá hạn có roastStatus EXPIRED và maxQuantity 0; lô khác bình thường', async () => {
    const expired = await fx.mkVariant('detail-old', {
      roastDate: new Date('2000-01-01T00:00:00Z'),
    });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: expired.productId } });
    const ok = await fx.mkVariant('detail-ok', { productId: p.id, roastDate: null });
    const res = await fx.call('get', `/products/${p.slug}`);
    expect(res.status).toBe(200);
    const vs = dataOf(res).variants as Array<Record<string, unknown>>;
    const old = vs.find((v) => v.id === expired.id)!;
    expect(old).toMatchObject({ roastStatus: 'EXPIRED', maxQuantity: 0, roastDate: '2000-01-01' });
    expect(old.roastAgeDays).toEqual(expect.any(Number));
    const good = vs.find((v) => v.id === ok.id)!;
    expect(good).toMatchObject({ roastStatus: null, roastAgeDays: null, maxQuantity: 20 });
  });
});

describe('độ tươi hạt theo thời gian (đồng hồ tiêm, D-082)', () => {
  /** Giỏ của user (giỏ khách vãng lai hết hạn sau 30 ngày so với đồng hồ tiêm nên không dùng ở đây). */
  async function guestCartWith(key: string, qty = 2) {
    const v = await fx.mkVariant(key, { roastDate: ROAST, stock: 10 });
    const u = await fx.mkUser(key);
    // Thêm bằng đồng hồ thật: ngày rang ở tương lai nên tuổi 0, còn bán.
    const res = await fx.add(u.who, v.id, qty);
    expect(res.status).toBe(201);
    const identity: CartIdentity = { kind: 'user', userId: u.id };
    return { v, identity, userId: u.id };
  }

  it('giỏ: 59 ngày chỉ cảnh báo (PAST_RECOMMENDED), 90 ngày còn bán, 91 ngày UNAVAILABLE và không tính tiền', async () => {
    const { identity } = await guestCartWith('cart');
    const at59 = await getCart(identity, D59);
    expect(at59.items[0]).toMatchObject({ roastAgeDays: 59, roastStatus: 'PAST_RECOMMENDED' });
    expect(at59.items[0]!.warnings).toEqual([]);
    expect(at59.subtotal).toBe(200000);

    const at90 = await getCart(identity, D90);
    expect(at90.items[0]).toMatchObject({ roastAgeDays: 90, roastStatus: 'PAST_RECOMMENDED' });
    expect(at90.subtotal).toBe(200000);

    const at91 = await getCart(identity, D91);
    expect(at91.items[0]).toMatchObject({ roastAgeDays: 91, roastStatus: 'EXPIRED' });
    expect(at91.items[0]!.warnings).toContain('UNAVAILABLE');
    expect(at91.subtotal).toBe(0);
    expect(at91.itemCount).toBe(0);
  });

  it('addItem tại ngày 91 bị từ chối, tại ngày 90 được', async () => {
    const v = await fx.mkVariant('add', { roastDate: ROAST, stock: 10 });
    const g1: CartIdentity = { kind: 'user', userId: (await fx.mkUser('add')).id };
    await expect(addItem(g1, { variantId: v.id, quantity: 1 }, D91)).rejects.toMatchObject({
      status: 409,
      code: 'ITEM_UNAVAILABLE',
      details: { reason: 'ROAST_EXPIRED' },
    });
    const ok = await addItem(g1, { variantId: v.id, quantity: 1 }, D90);
    expect(ok.items[0]!.roastStatus).toBe('PAST_RECOMMENDED');
  });

  it('quote: ngày 91 trả issue UNAVAILABLE kèm reason ROAST_EXPIRED; ngày 59 không có issue', async () => {
    const { identity } = await guestCartWith('quote');
    const q59 = await getQuote(identity, { provinceCode: '79' }, undefined, D59);
    expect(q59.issues).toEqual([]);
    const q91 = await getQuote(identity, { provinceCode: '79' }, undefined, D91);
    expect(q91.issues).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE', available: 0, reason: 'ROAST_EXPIRED' }),
    ]);
  });

  it('đặt đơn: ngày 91 bị từ chối 409 và không trừ kho; ngày 90 đặt được', async () => {
    const { v, identity, userId } = await guestCartWith('order');
    const addr = await fx.mkAddress(userId, DANANG);
    const body = {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'COD',
      acceptTerms: true,
    };
    const input = createOrderSchema.parse(body);
    await expect(
      placeOrder({ identity, idempotencyKey: crypto.randomUUID(), input, now: D91 }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'ITEM_UNAVAILABLE',
      details: { items: [{ variantId: v.id, reason: 'ROAST_EXPIRED' }] },
    });
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(10);

    const placed = await placeOrder({
      identity,
      idempotencyKey: crypto.randomUUID(),
      input: createOrderSchema.parse(body),
      now: D90,
    });
    expect(placed.order.status).toBe('PENDING');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(8);
  });

  it('mua lại: lô quá hạn rang bị bỏ qua (DISCONTINUED), lô còn hạn được thêm', async () => {
    const v = await fx.mkVariant('reorder', { roastDate: ROAST, stock: 10 });
    const u = await fx.mkUser('reorder');
    const line = (variantId: string) => ({
      variantId,
      quantity: 1,
      productName: 'Cà phê',
      variantName: '250g',
    });
    const late = await reorderLines(u.id, [line(v.id)], D91);
    expect(late.skipped).toEqual([
      expect.objectContaining({ variantId: v.id, reason: 'DISCONTINUED' }),
    ]);
    expect(late.added).toEqual([]);
    const early = await reorderLines(u.id, [line(v.id)], D90);
    expect(early.added).toHaveLength(1);
  });
});
