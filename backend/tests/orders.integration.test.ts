import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ORDER_CODE_REGEX } from '../src/lib/orderCode.js';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';
import { clearTestOutbox, testOutbox, waitForMail } from './authHelpers.js';
import { createFixtures, dataOf, DANANG, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm3o-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const orderCount = (variantId: string) =>
  prisma.order.count({ where: { items: { some: { variantId } } } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  clearTestOutbox();
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

describe('POST /orders - guest COD', () => {
  it('tạo đơn: snapshot do server dựng, trừ kho, movement, history, dọn giỏ, mail tra cứu', async () => {
    const coupon = await fx.mkCoupon('g1', { type: 'PERCENT', value: 10 });
    const v = await fx.mkVariant('g1', { price: 100000, stock: 2 });
    await prisma.product.update({ where: { id: v.productId }, data: { inStock: true } });
    const who = await fx.guestWith([[v.id, 2]]);
    await fx.call('post', '/cart/apply-coupon', who, { code: coupon.code });
    const body = fx.guestOrderBody({
      note: '  Gọi trước khi giao  ',
      expectedTotal: 200000 - 20000 + 20000,
      // dữ liệu giá/tên do client gửi phải bị bỏ qua
      items: [{ variantId: v.id, unitPrice: 1, quantity: 99 }],
      subtotal: 1,
      grandTotal: 1,
      shippingFee: 0,
      status: 'DELIVERED',
      userId: 'someone',
    });
    (body.shippingAddress as Record<string, unknown>).provinceName = 'Hack';
    (body.shippingAddress as Record<string, unknown>).wardName = 'Hack';
    const email = (body.contact as { email: string }).email;

    const res = await fx.postOrder(who, body);
    expect(res.status).toBe(201);
    const o = dataOf(res);
    expect(o.code).toMatch(ORDER_CODE_REGEX);
    expect(o).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      contact: { email, phone: '0901234567' },
      subtotal: 200000,
      discountTotal: 20000,
      shippingFee: 20000,
      shippingDiscount: 0,
      grandTotal: 200000,
      couponCode: coupon.code,
      note: 'Gọi trước khi giao',
      trackingNumber: null,
      carrier: null,
      cancelReason: null,
      expiresAt: null,
      paidAt: null,
      deliveredAt: null,
      canCancel: true,
    });
    expect(o.shippingAddress).toEqual({
      fullName: 'Nguyễn Văn An',
      phone: '0901234567',
      provinceCode: '79',
      provinceName: 'Thành phố Hồ Chí Minh',
      wardCode: '25747',
      wardName: 'Phường Thủ Dầu Một',
      line1: '12 Lê Lợi',
    });
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({
      productId: v.productId,
      variantId: v.id,
      productName: 'Sản phẩm g1 <b>',
      variantName: 'Biến thể g1',
      sku: v.sku,
      imageUrl: '/uploads/g1.jpg',
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
    });
    expect(o.history).toEqual([
      { fromStatus: null, toStatus: 'PENDING', note: null, createdAt: expect.any(String) },
    ]);
    for (const k of ['idempotencyKey', 'requestFingerprint', 'userId', 'couponId', 'id']) {
      expect(o).not.toHaveProperty(k);
    }
    expect(o.history[0]).not.toHaveProperty('actorId');

    // DB
    const row = await prisma.order.findUniqueOrThrow({
      where: { code: o.code },
      include: { items: true, movements: true, redemption: true },
    });
    expect(row.userId).toBeNull();
    expect(row.contactPhone).toBe('0901234567');
    expect(row.totalWeightGram).toBe(1000);
    expect(row.couponId).toBe(coupon.id);
    expect(row.items[0]!.weightGram).toBe(500);
    expect(row.movements).toHaveLength(1);
    expect(row.movements[0]).toMatchObject({
      variantId: v.id,
      reason: 'ORDER_RESERVE',
      change: -2,
      stockAfter: 0,
    });
    expect(row.redemption).toMatchObject({ couponId: coupon.id, userId: null, email });
    expect(await stockOf(v.id)).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).inStock).toBe(
      false,
    );
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);

    // giỏ trống, mã bị xóa
    const cart = await prisma.cart.findFirstOrThrow({
      where: { tokenHash: sha256Hex(who.token!) },
    });
    expect(cart.couponCode).toBeNull();
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    const after = dataOf(await fx.call('get', '/cart', who));
    expect(after.items).toEqual([]);

    // mail
    const mail = await waitForMail(email);
    expect(mail.subject).toBe(`BeanBox - Xác nhận đơn hàng ${o.code}`);
    const link = /https?:\/\/\S*tra-cuu-don-hang\?code=[A-Z0-9-]+/.exec(mail.text)?.[0];
    expect(link).toBe(`${env.WEB_APP_URL}/tra-cuu-don-hang?code=${o.code}`);
    expect(link).not.toContain('0901234567');
    expect(mail.text).toContain('x 2');
    expect(mail.html).toContain('Sản phẩm g1 &lt;b&gt;');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain(o.code);
  });

  it('SĐT +84 được chuẩn hóa; shippingMethod EXPRESS tính đúng phí', async () => {
    const v = await fx.mkVariant('g2', { price: 100000 });
    const who = await fx.guestWith([[v.id, 1]]);
    const res = await fx.postOrder(who, fx.guestOrderBody({ shippingMethod: 'EXPRESS' }));
    expect(res.status).toBe(201);
    expect(dataOf(res)).toMatchObject({
      shippingMethod: 'EXPRESS',
      shippingFee: 35000,
      grandTotal: 135000,
      contact: { phone: '0901234567' },
    });
  });

  it('đơn đủ freeship: shippingDiscount = fee và grandTotal khớp công thức', async () => {
    const v = await fx.mkVariant('g3', { price: 300000 });
    const who = await fx.guestWith([[v.id, 2]]);
    const res = await fx.postOrder(who, fx.guestOrderBody());
    expect(res.status).toBe(201);
    expect(dataOf(res)).toMatchObject({
      subtotal: 600000,
      shippingFee: 20000,
      shippingDiscount: 20000,
      grandTotal: 600000,
    });
  });

  it('guest thiếu contact -> 400 theo field; guest gửi addressId -> 401', async () => {
    const v = await fx.mkVariant('g4');
    const who = await fx.guestWith([[v.id, 1]]);
    const noContact = await fx.postOrder(who, fx.guestOrderBody({ contact: undefined }));
    expect(noContact.status).toBe(400);
    expect(
      (errOf(noContact).details as Array<{ field: string }>).map((d) => d.field).sort(),
    ).toEqual(['contact.email', 'contact.phone']);
    const noPhone = await fx.postOrder(
      who,
      fx.guestOrderBody({ contact: { email: fx.nextEmail() } }),
    );
    expect((errOf(noPhone).details as Array<{ field: string }>).map((d) => d.field)).toEqual([
      'contact.phone',
    ]);

    const body = fx.guestOrderBody({ addressId: 'abc' });
    delete (body as Record<string, unknown>).shippingAddress;
    const res = await fx.postOrder(who, body);
    expect(res.status).toBe(401);
    expect(errOf(res).code).toBe('UNAUTHORIZED');
    expect(await stockOf(v.id)).toBe(50);
  });

  it('validate body: acceptTerms, cả hai/không có địa chỉ, phường sai, SĐT sai', async () => {
    const v = await fx.mkVariant('g5');
    const who = await fx.guestWith([[v.id, 1]]);
    const terms = await fx.postOrder(who, fx.guestOrderBody({ acceptTerms: false }));
    expect(terms.status).toBe(400);
    expect(errOf(terms).details).toEqual([expect.objectContaining({ field: 'acceptTerms' })]);
    const noTerms = fx.guestOrderBody();
    delete (noTerms as Record<string, unknown>).acceptTerms;
    expect((await fx.postOrder(who, noTerms)).status).toBe(400);

    const both = await fx.postOrder(who, fx.guestOrderBody({ addressId: 'x' }));
    expect(both.status).toBe(400);
    const none = fx.guestOrderBody();
    delete (none as Record<string, unknown>).shippingAddress;
    expect((await fx.postOrder(who, none)).status).toBe(400);

    const badWard = fx.guestOrderBody();
    (badWard.shippingAddress as Record<string, unknown>).wardCode = DANANG.wardCode;
    const bw = await fx.postOrder(who, badWard);
    expect(bw.status).toBe(400);
    expect(errOf(bw).details).toEqual([expect.objectContaining({ field: 'wardCode' })]);

    const badPhone = fx.guestOrderBody({ contact: { email: fx.nextEmail(), phone: '12345' } });
    expect((await fx.postOrder(who, badPhone)).status).toBe(400);
    expect((await fx.postOrder(who, fx.guestOrderBody({ shippingMethod: 'DRONE' }))).status).toBe(
      400,
    );
    expect((await fx.postOrder(who, fx.guestOrderBody({ note: 'x'.repeat(501) }))).status).toBe(
      400,
    );
    expect(await stockOf(v.id)).toBe(50);
  });

  it('Idempotency-Key thiếu/sai định dạng -> 400 (kiểm trước body)', async () => {
    const v = await fx.mkVariant('g6');
    const who = await fx.guestWith([[v.id, 1]]);
    const missing = await fx.call('post', '/orders', who, { rubbish: true });
    expect(missing.status).toBe(400);
    expect(errOf(missing).details).toEqual([expect.objectContaining({ field: 'Idempotency-Key' })]);
    for (const bad of [
      'abc',
      randomUUID().replace(/-4([0-9a-f]{3}-[89ab])/, '-1$1'),
      'x'.repeat(36),
    ]) {
      const r = await fx.postOrder(who, fx.guestOrderBody(), bad);
      expect(r.status).toBe(400);
      expect((errOf(r).details as Array<{ field: string }>)[0]!.field).toBe('Idempotency-Key');
    }
    expect(await stockOf(v.id)).toBe(50);
  });

  it('paymentMethod VNPAY/STRIPE -> 409 PAYMENT_METHOD_UNAVAILABLE, kho không đổi', async () => {
    const v = await fx.mkVariant('g7');
    const who = await fx.guestWith([[v.id, 1]]);
    for (const paymentMethod of ['VNPAY', 'STRIPE']) {
      const r = await fx.postOrder(who, fx.guestOrderBody({ paymentMethod }));
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    }
    expect(await stockOf(v.id)).toBe(50);
  });
});

describe('POST /orders - user', () => {
  it('dùng addressId: snapshot từ địa chỉ, contact mặc định, gắn userId, mail link tài khoản', async () => {
    const u = await fx.mkUser('u1');
    const addr = await fx.mkAddress(u.id, DANANG, { phone: '0912345678' });
    const v = await fx.mkVariant('u1', { price: 100000 });
    await fx.add(u.who, v.id, 1);
    const res = await fx.postOrder(u.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'COD',
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    const o = dataOf(res);
    expect(o.contact).toEqual({ email: u.email, phone: '0912345678' });
    expect(o.shippingAddress).toEqual({
      fullName: 'Trần Thị Bình',
      phone: '0912345678',
      provinceCode: DANANG.provinceCode,
      provinceName: 'Tên tỉnh trong địa chỉ',
      wardCode: DANANG.wardCode,
      wardName: 'Tên phường trong địa chỉ',
      line1: '45 Nguyễn Huệ',
    });
    expect(o.shippingFee).toBe(35000); // vùng OTHER
    const row = await prisma.order.findUniqueOrThrow({
      where: { code: o.code },
      include: { history: true },
    });
    expect(row.userId).toBe(u.id);
    expect(row.history[0]!.actorId).toBe(u.id);
    const mail = await waitForMail(u.email);
    expect(mail.text).toContain(`${env.WEB_APP_URL}/tai-khoan/don-hang/${o.code}`);

    // GET của chủ đơn
    const get = await fx.call('get', `/orders/${o.code.toLowerCase()}`, u.who);
    expect(get.status).toBe(200);
    expect(dataOf(get)).toEqual(o);
    for (const k of ['idempotencyKey', 'requestFingerprint', 'userId', 'couponId']) {
      expect(dataOf(get)).not.toHaveProperty(k);
    }
  });

  it('contact.email/phone ghi đè mặc định; addressId của người khác -> 404', async () => {
    const u = await fx.mkUser('u2');
    const other = await fx.mkUser('u2b');
    const mine = await fx.mkAddress(u.id);
    const theirs = await fx.mkAddress(other.id);
    const v = await fx.mkVariant('u2', { stock: 5 });
    await fx.add(u.who, v.id, 1);
    const base = { shippingMethod: 'STANDARD', paymentMethod: 'COD', acceptTerms: true };

    const stolen = await fx.postOrder(u.who, { ...base, addressId: theirs.id });
    expect(stolen.status).toBe(404);
    expect(await stockOf(v.id)).toBe(5);

    const email = `${PREFIX}Alt-Contact@Example.test`;
    const ok = await fx.postOrder(u.who, {
      ...base,
      addressId: mine.id,
      contact: { email, phone: '0987654321' },
    });
    expect(ok.status).toBe(201);
    expect(dataOf(ok).contact).toEqual({ email: email.toLowerCase(), phone: '0987654321' });
  });

  it('user mới đặt bằng shippingAddress và không cần contact', async () => {
    const u = await fx.mkUser('u3');
    const v = await fx.mkVariant('u3');
    await fx.add(u.who, v.id, 1);
    const body = fx.guestOrderBody();
    delete (body as Record<string, unknown>).contact;
    const res = await fx.postOrder(u.who, body);
    expect(res.status).toBe(201);
    expect(dataOf(res).contact).toEqual({ email: u.email, phone: '0901234567' });
  });
});

describe('POST /orders - idempotency', () => {
  it('replay cùng key cùng body -> 200 cùng đơn, kho trừ 1 lần, không gửi mail lần 2, kể cả khi giỏ trống', async () => {
    const v = await fx.mkVariant('i1', { stock: 10 });
    const who = await fx.guestWith([[v.id, 3]]);
    const key = randomUUID().toUpperCase();
    const body = fx.guestOrderBody();
    const email = (body.contact as { email: string }).email;

    const first = await fx.postOrder(who, body, key);
    expect(first.status).toBe(201);
    await waitForMail(email);
    const again = await fx.postOrder(who, JSON.parse(JSON.stringify(body)), key.toLowerCase());
    expect(again.status).toBe(200);
    expect(dataOf(again)).toEqual(dataOf(first));
    await sleep(150);
    expect(testOutbox.filter((m) => m.to === email)).toHaveLength(1);
    expect(await stockOf(v.id)).toBe(7);
    expect(await orderCount(v.id)).toBe(1);
    const stored = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(first).code } });
    expect(stored.idempotencyKey).toBe(key.toLowerCase());
  });

  it('replay phản ánh trạng thái mới nhất của đơn', async () => {
    const v = await fx.mkVariant('i2');
    const who = await fx.guestWith([[v.id, 1]]);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    const first = await fx.postOrder(who, body, key);
    await prisma.order.update({
      where: { code: dataOf(first).code },
      data: { status: 'CONFIRMED' },
    });
    const again = await fx.postOrder(who, body, key);
    expect(again.status).toBe(200);
    expect(dataOf(again).status).toBe('CONFIRMED');
    expect(dataOf(again).canCancel).toBe(true);
  });

  it('cùng key khác body -> 409 IDEMPOTENCY_CONFLICT, không tạo đơn', async () => {
    const v = await fx.mkVariant('i3', { stock: 10 });
    const who = await fx.guestWith([[v.id, 1]]);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    expect((await fx.postOrder(who, body, key)).status).toBe(201);
    const changed = await fx.postOrder(who, { ...body, note: 'khác' }, key);
    expect(changed.status).toBe(409);
    expect(errOf(changed).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await orderCount(v.id)).toBe(1);
    expect(await stockOf(v.id)).toBe(9);
  });

  it('cùng key khác người gọi -> 409 và không lộ đơn', async () => {
    const v = await fx.mkVariant('i4', { stock: 10 });
    const g1 = await fx.guestWith([[v.id, 1]]);
    const g2 = await fx.guestWith([[v.id, 1]]);
    const u = await fx.mkUser('i4');
    await fx.add(u.who, v.id, 1);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    const first = await fx.postOrder(g1, body, key);
    expect(first.status).toBe(201);

    for (const who of [g2, u.who, {} as Who]) {
      const r = await fx.postOrder(who, body, key);
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('IDEMPOTENCY_CONFLICT');
      expect(JSON.stringify(r.body)).not.toContain(dataOf(first).code);
    }
    expect(await orderCount(v.id)).toBe(1);
  });

  it('5 request song song cùng key: đúng 1 đơn, không có 500', async () => {
    const v = await fx.mkVariant('i5', { stock: 10 });
    const who = await fx.guestWith([[v.id, 2]]);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fx.postOrder(who, body, key)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(4);
    expect(new Set(results.map((r) => dataOf(r).code)).size).toBe(1);
    expect(await orderCount(v.id)).toBe(1);
    expect(await stockOf(v.id)).toBe(8);
  });

  it('song song cùng key từ 2 giỏ guest khác nhau: 1 đơn, request còn lại 409, không 500', async () => {
    const v = await fx.mkVariant('i6', { stock: 10 });
    const g1 = await fx.guestWith([[v.id, 1]]);
    const g2 = await fx.guestWith([[v.id, 1]]);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    const [a, b] = await Promise.all([fx.postOrder(g1, body, key), fx.postOrder(g2, body, key)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await orderCount(v.id)).toBe(1);
    expect(await stockOf(v.id)).toBe(9);
  });
});

describe('POST /orders - lỗi nghiệp vụ', () => {
  it('CART_EMPTY: không có giỏ, giỏ đã xóa hết', async () => {
    const r = await fx.postOrder({}, fx.guestOrderBody());
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('CART_EMPTY');
    const u = await fx.mkUser('e1');
    const r2 = await fx.postOrder(u.who, fx.guestOrderBody());
    expect(errOf(r2).code).toBe('CART_EMPTY');
  });

  it('PRICE_CHANGED khi expectedTotal sai: kèm quote, kho không đổi', async () => {
    const v = await fx.mkVariant('p1', { price: 100000, stock: 5 });
    const who = await fx.guestWith([[v.id, 1]]);
    const r = await fx.postOrder(who, fx.guestOrderBody({ expectedTotal: 99999 }));
    expect(r.status).toBe(409);
    const e = errOf(r);
    expect(e.code).toBe('PRICE_CHANGED');
    expect(e.details).toMatchObject({ expectedTotal: 99999, grandTotal: 120000 });
    const quote = (
      e.details as {
        quote: { shippingOptions: unknown[]; paymentMethods: unknown[]; issues: unknown[] };
      }
    ).quote;
    expect(quote.shippingOptions).toHaveLength(2);
    expect(quote.paymentMethods).toHaveLength(3);
    expect(quote.issues).toEqual([]);
    expect(await stockOf(v.id)).toBe(5);
    expect(await orderCount(v.id)).toBe(0);

    // details.quote giống hệt quote thật cho cùng địa chỉ
    const real = await fx.call('post', '/checkout/quote', who, {
      provinceCode: '79',
      wardCode: '25747',
    });
    expect((e.details as { quote: unknown }).quote).toEqual(dataOf(real));

    const ok = await fx.postOrder(who, fx.guestOrderBody({ expectedTotal: 120000 }));
    expect(ok.status).toBe(201);
  });

  it('ITEM_UNAVAILABLE: biến thể bị ngừng bán', async () => {
    const good = await fx.mkVariant('a1', { stock: 5 });
    const off = await fx.mkVariant('a2', { stock: 5 });
    const who = await fx.guestWith([
      [good.id, 1],
      [off.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: off.id }, data: { isActive: false } });
    const r = await fx.postOrder(who, fx.guestOrderBody());
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('ITEM_UNAVAILABLE');
    expect(errOf(r).details).toEqual({ items: [{ variantId: off.id }] });
    expect(await stockOf(good.id)).toBe(5);
  });

  it('OUT_OF_STOCK liệt kê mọi dòng thiếu; không trừ kho dòng còn đủ', async () => {
    const a = await fx.mkVariant('s1', { stock: 5 });
    const b = await fx.mkVariant('s2', { stock: 5 });
    const c = await fx.mkVariant('s3', { stock: 5 });
    const who = await fx.guestWith([
      [a.id, 3],
      [b.id, 2],
      [c.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: a.id }, data: { stock: 1 } });
    await prisma.productVariant.update({ where: { id: b.id }, data: { stock: 0 } });
    const r = await fx.postOrder(who, fx.guestOrderBody());
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('OUT_OF_STOCK');
    const items = (errOf(r).details as { items: Array<{ variantId: string }> }).items;
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        { variantId: a.id, requested: 3, available: 1 },
        { variantId: b.id, requested: 2, available: 0 },
      ]),
    );
    expect(await stockOf(c.id)).toBe(5);
    expect(await orderCount(c.id)).toBe(0);
  });

  it('COUPON_INVALID: mã sai/hết điều kiện -> 409 kèm reason, rollback toàn bộ', async () => {
    const big = await fx.mkCoupon('min', { minOrder: 1_000_000 });
    const v = await fx.mkVariant('c1', { stock: 5 });
    const who = await fx.guestWith([[v.id, 1]]);

    const missing = await fx.postOrder(who, fx.guestOrderBody({ couponCode: 'KHONGCO' }));
    expect(missing.status).toBe(409);
    expect(errOf(missing)).toMatchObject({
      code: 'COUPON_INVALID',
      details: { reason: 'NOT_FOUND' },
    });

    const min = await fx.postOrder(who, fx.guestOrderBody({ couponCode: big.code }));
    expect(errOf(min).details).toEqual({ reason: 'MIN_ORDER', minOrder: 1_000_000 });
    expect(await stockOf(v.id)).toBe(5);
    expect(await orderCount(v.id)).toBe(0);
  });

  it('mã trong giỏ không còn hợp lệ -> 409 (không âm thầm bỏ mã)', async () => {
    const c = await fx.mkCoupon('stale');
    const v = await fx.mkVariant('c2', { stock: 5 });
    const who = await fx.guestWith([[v.id, 1]]);
    await fx.call('post', '/cart/apply-coupon', who, { code: c.code });
    await prisma.coupon.update({ where: { id: c.id }, data: { isActive: false } });
    const r = await fx.postOrder(who, fx.guestOrderBody());
    expect(r.status).toBe(409);
    expect(errOf(r).details).toEqual({ reason: 'INACTIVE' });
  });
});

describe('POST /orders - đồng thời', () => {
  it('race tồn kho: stock 3, 5 giỏ guest x 1 cái -> đúng 3 đơn, 2 x OUT_OF_STOCK, stock = 0', async () => {
    const v = await fx.mkVariant('race', { stock: 3 });
    const carts: Who[] = [];
    for (let i = 0; i < 5; i++) carts.push(await fx.guestWith([[v.id, 1]]));
    const results = await Promise.all(carts.map((who) => fx.postOrder(who, fx.guestOrderBody())));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(errOf(r).code).toBe('OUT_OF_STOCK');
    }
    expect(await stockOf(v.id)).toBe(0);
    expect(await orderCount(v.id)).toBe(3);
    expect(await prisma.inventoryMovement.count({ where: { variantId: v.id } })).toBe(3);
    const last = await prisma.inventoryMovement.findMany({
      where: { variantId: v.id },
      orderBy: { stockAfter: 'asc' },
    });
    expect(last.map((m) => m.stockAfter)).toEqual([0, 1, 2]);
  });

  it('race nhiều variant cùng sản phẩm theo thứ tự ngược nhau: không deadlock, kho đúng', async () => {
    const v1 = await fx.mkVariant('dl1', { stock: 10 });
    const v2 = await fx.mkVariant('dl2', { stock: 10, productId: v1.productId });
    const carts: Who[] = [];
    for (let i = 0; i < 4; i++) {
      carts.push(
        await fx.guestWith(
          i % 2 === 0
            ? [
                [v1.id, 1],
                [v2.id, 1],
              ]
            : [
                [v2.id, 1],
                [v1.id, 1],
              ],
        ),
      );
    }
    const results = await Promise.all(carts.map((who) => fx.postOrder(who, fx.guestOrderBody())));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(await stockOf(v1.id)).toBe(6);
    expect(await stockOf(v2.id)).toBe(6);
  });

  it('usageLimit 1, 2 đơn song song: 1 thành công, 1 USAGE_LIMIT và kho đơn thất bại không bị trừ', async () => {
    const c = await fx.mkCoupon('ul', { usageLimit: 1 });
    const v1 = await fx.mkVariant('ul1', { stock: 5 });
    const v2 = await fx.mkVariant('ul2', { stock: 5 });
    const g1 = await fx.guestWith([[v1.id, 2]]);
    const g2 = await fx.guestWith([[v2.id, 2]]);
    const [a, b] = await Promise.all([
      fx.postOrder(g1, fx.guestOrderBody({ couponCode: c.code })),
      fx.postOrder(g2, fx.guestOrderBody({ couponCode: c.code })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expect(errOf(failed)).toMatchObject({
      code: 'COUPON_INVALID',
      details: { reason: 'USAGE_LIMIT' },
    });
    const failedVariant = a.status === 409 ? v1 : v2;
    const okVariant = a.status === 409 ? v2 : v1;
    expect(await stockOf(failedVariant.id)).toBe(5);
    expect(await stockOf(okVariant.id)).toBe(3);
    expect(await orderCount(failedVariant.id)).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { variantId: failedVariant.id } })).toBe(
      0,
    );
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(1);
    expect(await prisma.couponRedemption.count({ where: { couponId: c.id } })).toBe(1);
  });

  it('perUserLimit 1, cùng email, 2 đơn song song: 1 thành công, 1 PER_USER_LIMIT', async () => {
    const c = await fx.mkCoupon('pu', { perUserLimit: 1 });
    const v1 = await fx.mkVariant('pu1', { stock: 5 });
    const v2 = await fx.mkVariant('pu2', { stock: 5 });
    const g1 = await fx.guestWith([[v1.id, 1]]);
    const g2 = await fx.guestWith([[v2.id, 1]]);
    const contact = { email: fx.nextEmail(), phone: '0901234567' };
    const [a, b] = await Promise.all([
      fx.postOrder(g1, fx.guestOrderBody({ contact, couponCode: c.code })),
      fx.postOrder(g2, fx.guestOrderBody({ contact, couponCode: c.code })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expect(errOf(failed)).toMatchObject({
      code: 'COUPON_INVALID',
      details: { reason: 'PER_USER_LIMIT' },
    });
    const failedVariant = a.status === 409 ? v1 : v2;
    expect(await stockOf(failedVariant.id)).toBe(5);
    expect(await prisma.couponRedemption.count({ where: { couponId: c.id } })).toBe(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(1);
  });
});

describe('GET /orders/:code', () => {
  it('chủ đơn 200; user khác 404; đơn guest 404; không tồn tại 404; không token 401', async () => {
    const owner = await fx.mkUser('r-owner');
    const other = await fx.mkUser('r-other');
    const v = await fx.mkVariant('r1', { stock: 10 });
    await fx.add(owner.who, v.id, 1);
    const placed = await fx.postOrder(owner.who, fx.guestOrderBody());
    const code = dataOf(placed).code as string;
    const guest = await fx.guestWith([[v.id, 1]]);
    const guestOrder = await fx.postOrder(guest, fx.guestOrderBody());
    const guestCode = dataOf(guestOrder).code as string;

    expect((await fx.call('get', `/orders/${code}`, owner.who)).status).toBe(200);
    expect(
      (await fx.call('get', `/orders/${` ${code.toLowerCase()} `.replace(/ /g, '%20')}`, owner.who))
        .status,
    ).toBe(200);

    const mine = await fx.call('get', `/orders/${code}`, other.who);
    const none = await fx.call('get', '/orders/BB-000000-AAAA', other.who);
    const guestOne = await fx.call('get', `/orders/${guestCode}`, owner.who);
    for (const r of [mine, none, guestOne]) {
      expect(r.status).toBe(404);
      expect(errOf(r).code).toBe('NOT_FOUND');
    }
    expect(errOf(mine).message).toBe(errOf(none).message);
    expect(errOf(mine).message).toBe(errOf(guestOne).message);

    const anon = await fx.call('get', `/orders/${code}`);
    expect(anon.status).toBe(401);
  });

  it('STAFF/ADMIN cũng nhận 404 với đơn của người khác', async () => {
    const owner = await fx.mkUser('r-own2');
    const staff = await fx.mkUser('r-staff');
    await prisma.user.update({ where: { id: staff.id }, data: { role: 'ADMIN' } });
    const v = await fx.mkVariant('r2', { stock: 10 });
    await fx.add(owner.who, v.id, 1);
    const code = dataOf(await fx.postOrder(owner.who, fx.guestOrderBody())).code as string;
    expect((await fx.call('get', `/orders/${code}`, staff.who)).status).toBe(404);
  });
});
