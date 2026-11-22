import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { updateOrderStatus } from '../src/modules/admin/orders/orders.service.js';
import { placeOrder, trackOrder } from '../src/modules/orders/orders.service.js';
import request from 'supertest';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, DANANG, type Who } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

/** Vận chuyển giả lập (D-062): ETA, snapshot trên đơn, mã vận đơn giả, hành trình mô phỏng. */

const PREFIX = 'tship-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };

const quote = (who: Who, body: Record<string, unknown>) =>
  fx.call('post', '/checkout/quote', who, body);
const patchStatus = (code: string, body: Record<string, unknown>) =>
  fx.call('patch', `/admin/orders/${code}/status`, staff.who, body);
const track = (code: string, phone: string) =>
  fx.call('get', `/orders/track?${new URLSearchParams({ code, phone })}`);

async function cleanAudit() {
  const orders = await prisma.order.findMany({
    where: { contactEmail: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: 'Order', entityId: { in: orders.map((o) => o.id) } },
  });
}

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    guestCancelRateLimit: BIG,
    couponRateLimit: BIG,
    quoteRateLimit: BIG,
    orderRateLimit: BIG,
    trackRateLimit: BIG,
  });
  await cleanAudit();
  await fx.setup();
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
});
afterAll(async () => {
  await cleanAudit();
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
  await fx.setSetting('shipping.eta', {
    inner: { STANDARD: { minDays: 1, maxDays: 2 }, EXPRESS: { minDays: 0, maxDays: 1 } },
    other: { STANDARD: { minDays: 3, maxDays: 5 }, EXPRESS: { minDays: 1, maxDays: 3 } },
  });
});
afterEach(async () => {
  await fx.restoreSettings();
});

describe('POST /checkout/quote: eta', () => {
  it('mỗi phương thức có eta theo vùng; giá không đổi', async () => {
    const v = await fx.mkVariant('q1', { price: 100000 });
    const who = await fx.guestWith([[v.id, 1]]);
    const inner = dataOf(await quote(who, { provinceCode: '79' }));
    const other = dataOf(await quote(who, { provinceCode: DANANG.provinceCode }));
    const byMethod = (d: { shippingOptions: Array<{ method: string }> }, m: string) =>
      d.shippingOptions.find((o) => o.method === m) as unknown as {
        fee: number;
        grandTotal: number;
        estimatedDays: string;
        eta: { minDays: number; maxDays: number; fromDate: string; toDate: string };
      };
    expect(byMethod(inner, 'STANDARD')).toMatchObject({
      fee: 20000,
      grandTotal: 120000,
      estimatedDays: '1-2',
      eta: { minDays: 1, maxDays: 2 },
    });
    expect(byMethod(inner, 'EXPRESS').eta).toMatchObject({ minDays: 0, maxDays: 1 });
    expect(byMethod(other, 'STANDARD')).toMatchObject({
      fee: 35000,
      estimatedDays: '3-5',
      eta: { minDays: 3, maxDays: 5 },
    });
    // Ngày dạng YYYY-MM-DD và toDate - fromDate = maxDays - minDays.
    for (const o of [byMethod(inner, 'STANDARD'), byMethod(other, 'EXPRESS')]) {
      expect(o.eta.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const span = (Date.parse(o.eta.toDate) - Date.parse(o.eta.fromDate)) / 86_400_000;
      expect(span).toBe(o.eta.maxDays - o.eta.minDays);
    }
  });

  it('đổi settings shipping.eta thì quote đổi theo', async () => {
    await fx.setSetting('shipping.eta', {
      inner: { STANDARD: { minDays: 4, maxDays: 4 }, EXPRESS: { minDays: 2, maxDays: 3 } },
      other: { STANDARD: { minDays: 3, maxDays: 5 }, EXPRESS: { minDays: 1, maxDays: 3 } },
    });
    const v = await fx.mkVariant('q2', { price: 100000 });
    const who = await fx.guestWith([[v.id, 1]]);
    const q = dataOf(await quote(who, { provinceCode: '79' }));
    expect(q.shippingOptions[0].estimatedDays).toBe('4');
    expect(q.shippingOptions[0].eta.fromDate).toBe(q.shippingOptions[0].eta.toDate);
  });
});

describe('đặt đơn lưu snapshot ETA', () => {
  it('etaFrom/etaTo theo ngày VN lúc đặt (đồng hồ tiêm, biên nửa đêm)', async () => {
    const v = await fx.mkVariant('o1', { price: 100000 });
    const who = await fx.guestWith([[v.id, 1]]);
    const body = fx.guestOrderBody({ shippingMethod: 'EXPRESS' });
    const result = await placeOrder({
      identity: { kind: 'guest', token: who.token! },
      idempotencyKey: randomUUID(),
      input: body as never,
      // 23:30 giờ VN ngày 22/11 (= 16:30Z)
      now: new Date('2026-11-22T16:30:00Z'),
    });
    expect(result.order).toMatchObject({ etaFrom: '2026-11-22', etaTo: '2026-11-23' });
    const row = await prisma.order.findUniqueOrThrow({ where: { code: result.order.code } });
    expect(row.etaFrom?.toISOString()).toBe('2026-11-22T00:00:00.000Z');
    expect(row.etaTo?.toISOString()).toBe('2026-11-23T00:00:00.000Z');

    // 00:30 giờ VN ngày 23/11 (= 17:30Z ngày 22/11): tính từ ngày 23/11, vùng ngoại tỉnh chuẩn 3-5
    const v2 = await fx.mkVariant('o1b', { price: 100000 });
    const who2 = await fx.guestWith([[v2.id, 1]]);
    const r2 = await placeOrder({
      identity: { kind: 'guest', token: who2.token! },
      idempotencyKey: randomUUID(),
      input: fx.guestOrderBody({
        shippingAddress: {
          fullName: 'Nguyễn Văn An',
          phone: '0901234567',
          ...DANANG,
          line1: '1 Bạch Đằng',
        },
      }) as never,
      now: new Date('2026-11-22T17:30:00Z'),
    });
    expect(r2.order).toMatchObject({ etaFrom: '2026-11-26', etaTo: '2026-11-28' });
  });

  it('snapshot không đổi khi settings đổi sau đó; replay idempotent trả cùng đơn', async () => {
    const v = await fx.mkVariant('o2', { price: 100000 });
    const who = await fx.guestWith([[v.id, 1]]);
    const key = randomUUID();
    const body = fx.guestOrderBody();
    const first = await fx.postOrder(who, body, key);
    expect(first.status).toBe(201);
    const etaBefore = [dataOf(first).etaFrom, dataOf(first).etaTo];
    expect(etaBefore[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await fx.setSetting('shipping.eta', {
      inner: { STANDARD: { minDays: 9, maxDays: 10 }, EXPRESS: { minDays: 9, maxDays: 10 } },
      other: { STANDARD: { minDays: 9, maxDays: 10 }, EXPRESS: { minDays: 9, maxDays: 10 } },
    });
    const replay = await fx.postOrder(who, body, key);
    expect(replay.status).toBe(200);
    expect(dataOf(replay).code).toBe(dataOf(first).code);
    expect([dataOf(replay).etaFrom, dataOf(replay).etaTo]).toEqual(etaBefore);
    expect(dataOf(replay).grandTotal).toBe(dataOf(first).grandTotal);
  });

  it('giá đơn không đổi so với trước (STANDARD HCM, 100.000 + 20.000)', async () => {
    const v = await fx.mkVariant('o3', { price: 100000 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    expect(order).toMatchObject({ shippingFee: 20000, grandTotal: 120000, shipment: null });
  });
});

describe('chuyển SHIPPING: mã vận đơn giả lập', () => {
  async function toProcessing(key: string, method: 'STANDARD' | 'EXPRESS' = 'STANDARD') {
    const v = await fx.mkVariant(key, { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]], { shippingMethod: method });
    const code = order.code as string;
    for (const [from, to] of [
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PROCESSING'],
    ]) {
      expect((await patchStatus(code, { fromStatus: from, toStatus: to })).status).toBe(200);
    }
    return code;
  }

  it('để trống -> mã BBL + hãng Logistics (STANDARD); EXPRESS -> BBE + Express', async () => {
    const std = await toProcessing('s1');
    const r1 = await patchStatus(std, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    expect(r1.status).toBe(200);
    expect(dataOf(r1)).toMatchObject({
      trackingNumber: expect.stringMatching(/^BBL-\d{8}-[A-HJKMNP-Z2-9]{6}$/),
      carrier: 'BeanBox Logistics (giả lập)',
    });
    const exp = await toProcessing('s2', 'EXPRESS');
    const r2 = await patchStatus(exp, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    expect(dataOf(r2)).toMatchObject({
      trackingNumber: expect.stringMatching(/^BBE-\d{8}-[A-HJKMNP-Z2-9]{6}$/),
      carrier: 'BeanBox Express (giả lập)',
    });
    expect(dataOf(r1).trackingNumber).not.toBe(dataOf(r2).trackingNumber);
  });

  it('có nhập -> giữ nguyên, không bị ghi đè bằng mã giả', async () => {
    const code = await toProcessing('s3');
    const res = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'GHN-777',
      carrier: 'GHN',
    });
    expect(dataOf(res)).toMatchObject({ trackingNumber: 'GHN-777', carrier: 'GHN' });
  });

  it('chỉ nhập mã (không hãng) -> giữ mã, không gán hãng giả lập', async () => {
    const code = await toProcessing('s4');
    const res = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'ABC-1',
    });
    expect(dataOf(res)).toMatchObject({ trackingNumber: 'ABC-1', carrier: null });
  });

  it('FAILED_DELIVERY -> SHIPPING để trống: dùng lại mã cũ', async () => {
    const code = await toProcessing('s5');
    const a = await patchStatus(code, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    const tn = dataOf(a).trackingNumber as string;
    await patchStatus(code, {
      fromStatus: 'SHIPPING',
      toStatus: 'FAILED_DELIVERY',
      note: 'Khách vắng nhà',
    });
    const b = await patchStatus(code, { fromStatus: 'FAILED_DELIVERY', toStatus: 'SHIPPING' });
    expect(dataOf(b).trackingNumber).toBe(tn);
    const events = dataOf(b).shipment.events.map((e: { code: string }) => e.code);
    expect(events).toContain('FAILED_DELIVERY');
    expect(events).toContain('REDELIVERING');
  });

  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const idx = (suffix: string) => suffix.split('').map((c) => alphabet.indexOf(c));
  const oneMore = async (key: string) => {
    const code = await toProcessing(key);
    const row = await prisma.order.findUniqueOrThrow({ where: { code } });
    return { code, row };
  };

  it('D-068: mã giả sinh trùng (P2002) -> chạy lại transaction, lần sau mã khác', async () => {
    const a = await toProcessing('s6');
    const first = await patchStatus(a, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    const taken = dataOf(first).trackingNumber as string; // BBL-YYYYMMDD-XXXXXX
    const { code } = await oneMore('s6b');
    // Lần 1 sinh đúng mã đã có (trùng), lần 2 sinh 'AAAAAA'.
    const seq = [...idx(taken.slice(-6)), 0, 0, 0, 0, 0, 0];
    let i = 0;
    const dto = await updateOrderStatus({
      rawCode: code,
      input: {
        fromStatus: 'PROCESSING',
        toStatus: 'SHIPPING',
        note: undefined,
        trackingNumber: undefined,
        carrier: undefined,
      },
      actorId: staff.id,
      role: 'STAFF',
      ip: null,
      randomInt: () => seq[i++]!,
    });
    expect(dto.trackingNumber?.endsWith('-AAAAAA')).toBe(true);
    expect(dto.trackingNumber).not.toBe(taken);
    expect(i).toBe(12);
    // Đơn cũ không bị đổi.
    const old = await prisma.order.findUniqueOrThrow({ where: { code: a } });
    expect(old.trackingNumber).toBe(taken);
  });

  it('D-068: sinh trùng liên tục -> hết số lần thử -> 500 INTERNAL_ERROR, đơn không đổi', async () => {
    const a = await toProcessing('s7');
    const first = await patchStatus(a, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    const taken = dataOf(first).trackingNumber as string;
    const { code } = await oneMore('s7b');
    const same = idx(taken.slice(-6));
    let i = 0;
    await expect(
      updateOrderStatus({
        rawCode: code,
        input: {
          fromStatus: 'PROCESSING',
          toStatus: 'SHIPPING',
          note: undefined,
          trackingNumber: undefined,
          carrier: undefined,
        },
        actorId: staff.id,
        role: 'STAFF',
        ip: null,
        randomInt: () => same[i++ % 6]!,
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(i).toBe(8 * 6);
    const row = await prisma.order.findUniqueOrThrow({ where: { code } });
    expect(row.status).toBe('PROCESSING');
    expect(row.trackingNumber).toBeNull();
  });

  it('D-068: staff nhập mã đã dùng cho đơn khác -> 409 TRACKING_NUMBER_TAKEN, đơn không đổi', async () => {
    const a = await toProcessing('s8');
    expect(
      (
        await patchStatus(a, {
          fromStatus: 'PROCESSING',
          toStatus: 'SHIPPING',
          trackingNumber: 'DUP-D068-1',
        })
      ).status,
    ).toBe(200);
    const { code } = await oneMore('s8b');
    const res = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'DUP-D068-1',
    });
    expect(res.status).toBe(409);
    expect(errOf(res)).toMatchObject({
      code: 'TRACKING_NUMBER_TAKEN',
      details: { field: 'trackingNumber' },
    });
    const row = await prisma.order.findUniqueOrThrow({ where: { code } });
    expect(row.status).toBe('PROCESSING');
    expect(row.trackingNumber).toBeNull();
    // Sau lỗi, đơn vẫn chuyển được với mã khác.
    const ok = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'DUP-D068-2',
    });
    expect(ok.status).toBe(200);
  });

  it('D-068: giao lại bằng chính mã của đơn đó không bị coi là trùng', async () => {
    const a = await toProcessing('s9');
    const one = await patchStatus(a, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'SELF-D068-1',
    });
    expect(one.status).toBe(200);
    await patchStatus(a, { fromStatus: 'SHIPPING', toStatus: 'FAILED_DELIVERY', note: 'Vắng nhà' });
    const again = await patchStatus(a, {
      fromStatus: 'FAILED_DELIVERY',
      toStatus: 'SHIPPING',
      trackingNumber: 'SELF-D068-1',
    });
    expect(again.status).toBe(200);
  });

  it('D-068: mã rỗng/khoảng trắng chuẩn hóa thành "không nhập" (server sinh mã giả), không 400', async () => {
    for (const [key, blank] of [
      ['s10', ''],
      ['s11', '   '],
      ['s12', null],
    ] as const) {
      const code = await toProcessing(key);
      const res = await patchStatus(code, {
        fromStatus: 'PROCESSING',
        toStatus: 'SHIPPING',
        trackingNumber: blank,
      });
      expect(res.status, key).toBe(200);
      expect(dataOf(res).trackingNumber).toMatch(/^BBL-\d{8}-[A-HJKMNP-Z2-9]{6}$/);
    }
  });
});

describe('shipment trong API', () => {
  it('guest track: shipment.events sau SHIPPING; trước đó shipment = null', async () => {
    const v = await fx.mkVariant('t1', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    const phone = '0901234567';
    expect(dataOf(await track(code, phone)).shipment).toBeNull();
    for (const [from, to] of [
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PROCESSING'],
      ['PROCESSING', 'SHIPPING'],
    ]) {
      expect((await patchStatus(code, { fromStatus: from, toStatus: to })).status).toBe(200);
    }
    const d = dataOf(await track(code, phone));
    expect(d.shipment).toMatchObject({
      simulated: true,
      carrier: 'BeanBox Logistics (giả lập)',
      trackingNumber: expect.stringMatching(/^BBL-/),
    });
    expect(d.shipment.events[0]).toMatchObject({
      code: 'HANDOVER',
      label: 'Đã bàn giao cho đơn vị vận chuyển',
    });
    expect(d.etaFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Đồng hồ tiêm: 3 ngày sau -> đủ mốc giả; nhiều hơn mốc thật.
    const later = await trackOrder(code, phone, { now: new Date(Date.now() + 10 * 86_400_000) });
    expect(later.shipment!.events.map((e) => e.code)).toEqual([
      'HANDOVER',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
    ]);
    // Thời điểm trước khi vào SHIPPING: không có mốc nào.
    const earlier = await trackOrder(code, phone, { now: new Date(Date.now() - 86_400_000) });
    expect(earlier.shipment!.events).toEqual([]);

    // DELIVERED: thêm "giao thành công", cắt mốc giả sau đó.
    expect(
      (await patchStatus(code, { fromStatus: 'SHIPPING', toStatus: 'DELIVERED' })).status,
    ).toBe(200);
    const done = dataOf(await track(code, phone)).shipment.events as Array<{ code: string }>;
    expect(done.at(-1)!.code).toBe('DELIVERED');
    expect(done.map((e) => e.code)).not.toContain('OUT_FOR_DELIVERY');
  });

  it('đơn của khách và admin cùng có shipment, etaFrom/etaTo', async () => {
    const v = await fx.mkVariant('t2', { stock: 5 });
    const order = await placeUserOrder(fx, customer, [[v.id, 1]]);
    const code = order.code as string;
    expect(order).toMatchObject({ shipment: null });
    expect(order.etaFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const [from, to] of [
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PROCESSING'],
      ['PROCESSING', 'SHIPPING'],
    ]) {
      await patchStatus(code, { fromStatus: from, toStatus: to });
    }
    const mine = dataOf(await fx.call('get', `/orders/${code}`, customer.who));
    expect(mine.shipment.events.length).toBeGreaterThanOrEqual(1);
    expect(mine.shipment.trackingNumber).toBe(mine.trackingNumber);
    const adm = dataOf(await fx.call('get', `/admin/orders/${code}`, staff.who));
    expect(adm.shipment.simulated).toBe(true);
    expect(adm.etaTo).toBe(mine.etaTo);
  });
});

describe('PUT /admin/settings shipping.eta', () => {
  it('min > max -> 400 VALIDATION_ERROR; hợp lệ -> 200', async () => {
    const admin = await fx.mkUser('adm');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const eta = (std: unknown) => ({
      inner: { STANDARD: std, EXPRESS: { minDays: 0, maxDays: 1 } },
      other: { STANDARD: { minDays: 3, maxDays: 5 }, EXPRESS: { minDays: 1, maxDays: 3 } },
    });
    const put = (value: unknown) =>
      request(app)
        .put(`${API}/admin/settings`)
        .set('Origin', ORIGIN)
        .set(admin.who.auth!)
        .send({ 'shipping.eta': value });
    const bad = await put(eta({ minDays: 5, maxDays: 2 }));
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('VALIDATION_ERROR');
    expect(errOf(bad).details).toEqual([
      expect.objectContaining({ field: 'shipping.eta.inner.STANDARD.minDays' }),
    ]);
    const tooBig = await put(eta({ minDays: 0, maxDays: 31 }));
    expect(tooBig.status).toBe(400);
    const good = await put(eta({ minDays: 2, maxDays: 2 }));
    expect(good.status).toBe(200);
    expect(dataOf(good)['shipping.eta'].inner.STANDARD).toEqual({ minDays: 2, maxDays: 2 });
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id } });
  });
});
