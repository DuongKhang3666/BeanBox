import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  afterOrdersExpired,
  EXPIRE_REASON,
  GUEST_COD_EXPIRE_REASON,
  runExpireGuestCodOnce,
  runExpirePendingPaymentsOnce,
} from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import type { TurnstileResult, TurnstileVerifier } from '../src/lib/turnstile.js';
import { vnDateKey } from '../src/modules/admin/dashboard/dashboard.service.js';
import { getOperations } from '../src/modules/admin/analytics/analytics.operations.js';
import { clearTestOutbox, testOutbox } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeUserOrder } from './orderTestHelpers.js';

/** R-04 (D-057): đơn COD khách vãng lai: hạn giữ kho, giới hạn đơn mở, captcha, phân loại analytics. */

const PREFIX = 'tm1g-';
const HOUR = 3600 * 1000;
const SITE_KEY = 'fake-site-key-public';
const SECRET_KEY = 'fake-secret-key-never-leak';

let plainApp: Express;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const verify = vi.fn<TurnstileVerifier>();

let phoneSeq = 0;
/** SĐT hợp lệ, duy nhất trong từng lần chạy (tránh đụng dữ liệu của test khác). */
const newPhone = () => `0977${String(Date.now() % 100000).padStart(5, '0')}${++phoneSeq % 10}`;

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const statusOf = async (code: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { code } })).status;

async function mkVariantPrice(key: string, stock = 20) {
  const v = await fx.mkVariant(key, { price: 100000, stock });
  await prisma.product.update({ where: { id: v.productId }, data: { inStock: true } });
  return v;
}

/** Đặt một đơn COD guest; trả res/who/body/key để test replay. */
async function place(
  variantId: string,
  contact: { email?: string; phone: string },
  over: Record<string, unknown> = {},
  key: string = randomUUID(),
) {
  const who = await fx.guestWith([[variantId, 1]]);
  const body = fx.guestOrderBody({
    contact: { email: contact.email ?? fx.nextEmail(), phone: contact.phone },
    ...over,
  });
  const res = await fx.postOrder(who, body, key);
  return { res, who, body, key };
}

beforeAll(async () => {
  env.GUEST_COD_MAX_OPEN = 3; // suite chung nới lên 100 (tests/testEnv.ts)
  plainApp = createApp({
    generalRateLimit: 100_000,
    authRateLimit: 100_000,
    couponRateLimit: 100_000,
    quoteRateLimit: 100_000,
    orderRateLimit: 100_000,
    captchaConfig: null,
  });
  app = plainApp;
  await fx.setup();
});
afterAll(async () => {
  env.GUEST_COD_MAX_OPEN = 100;
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  clearTestOutbox();
  verify.mockReset();
  app = plainApp;
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.innerCityProvinceCodes', ['01', '79']);
  await fx.setSetting('shipping.innerCityWardCodes', []);
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
});
afterEach(async () => {
  await fx.restoreSettings();
});

describe('job hủy đơn COD khách vãng lai quá hạn xác nhận', () => {
  it('47 giờ chưa hủy; 49 giờ hủy + hoàn kho + hoàn lượt mã + history + email; chạy lần hai không làm gì', async () => {
    const coupon = await fx.mkCoupon('job1', { type: 'PERCENT', value: 10, usageLimit: 5 });
    const v = await mkVariantPrice('job1', 10);
    const who = await fx.guestWith([[v.id, 2]]);
    await fx.call('post', '/cart/apply-coupon', who, { code: coupon.code });
    const email = fx.nextEmail();
    const res = await fx.postOrder(
      who,
      fx.guestOrderBody({ contact: { email, phone: newPhone() } }),
    );
    expect(res.status).toBe(201);
    const code = dataOf(res).code as string;
    const order = await prisma.order.findUniqueOrThrow({ where: { code } });
    expect(await stockOf(v.id)).toBe(8);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
    clearTestOutbox();

    // 47 giờ: chưa quá hạn 48 giờ.
    const early = await runExpireGuestCodOnce(new Date(order.createdAt.getTime() + 47 * HOUR));
    expect(early.skipped).toBe(false);
    if (!early.skipped) expect(early.cancelled.map((o) => o.code)).not.toContain(code);
    expect(await statusOf(code)).toBe('PENDING');
    expect(await stockOf(v.id)).toBe(8);

    // 49 giờ: hủy.
    const now = new Date(order.createdAt.getTime() + 49 * HOUR);
    const r = await runExpireGuestCodOnce(now);
    expect(r.skipped).toBe(false);
    if (r.skipped) throw new Error('bị bỏ qua');
    const mine = r.cancelled.filter((o) => o.id === order.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ code, userId: null, stripeSessionIds: [] });

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { history: { orderBy: { createdAt: 'asc' } }, redemption: true },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.cancelReason).toBe(GUEST_COD_EXPIRE_REASON);
    expect(after.cancelledAt?.getTime()).toBe(now.getTime());
    const h = after.history.filter((x) => x.toStatus === 'CANCELLED');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      fromStatus: 'PENDING',
      actorId: null,
      note: GUEST_COD_EXPIRE_REASON,
    });
    // Hoàn kho (+ movement) và hoàn lượt mã.
    expect(await stockOf(v.id)).toBe(10);
    const releases = await prisma.inventoryMovement.findMany({
      where: { orderId: order.id, reason: 'ORDER_RELEASE' },
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ change: 2, actorId: null });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect(after.redemption?.releasedAt).not.toBeNull();

    // Email trạng thái hủy (cùng đường với job hết hạn thanh toán).
    await afterOrdersExpired(mine);
    await vi.waitFor(() => {
      const mail = testOutbox.find((m) => m.to === email && m.subject.includes('đã được hủy'));
      expect(mail).toBeDefined();
      expect(mail!.text).toContain(GUEST_COD_EXPIRE_REASON);
    });

    // Chạy lần hai: không hủy thêm, không hoàn kho lần hai.
    const again = await runExpireGuestCodOnce(now);
    expect(again.skipped).toBe(false);
    if (!again.skipped) expect(again.cancelled.map((o) => o.id)).not.toContain(order.id);
    expect(await stockOf(v.id)).toBe(10);
    expect(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, reason: 'ORDER_RELEASE' },
      }),
    ).toBe(1);
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, toStatus: 'CANCELLED' },
      }),
    ).toBe(1);
  });

  it('holdHours tuỳ biến và mặc định env.GUEST_COD_HOLD_HOURS = 48', async () => {
    expect(env.GUEST_COD_HOLD_HOURS).toBe(48);
    const v = await mkVariantPrice('job2');
    const { res } = await place(v.id, { phone: newPhone() });
    const order = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(res).code } });
    const at = new Date(order.createdAt.getTime() + 2 * HOUR);
    await runExpireGuestCodOnce(at, 3);
    expect(await statusOf(order.code)).toBe('PENDING');
    await runExpireGuestCodOnce(at, 1);
    expect(await statusOf(order.code)).toBe('CANCELLED');
  });

  it('không hủy: đơn của khách có tài khoản, đơn đã xác nhận, đơn online (đã có expiresAt)', async () => {
    const user = await fx.mkUser('job3');
    const vu = await mkVariantPrice('job3u');
    const userOrder = await placeUserOrder(fx, user, [[vu.id, 1]]);

    const vc = await mkVariantPrice('job3c');
    const confirmed = dataOf((await place(vc.id, { phone: newPhone() })).res).code as string;
    await prisma.order.update({ where: { code: confirmed }, data: { status: 'CONFIRMED' } });

    const vo = await mkVariantPrice('job3o');
    const online = dataOf((await place(vo.id, { phone: newPhone() })).res).code as string;
    await prisma.order.update({
      where: { code: online },
      data: {
        status: 'PENDING_PAYMENT',
        paymentMethod: 'VNPAY',
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    const far = new Date(Date.now() + 100 * HOUR);
    const r = await runExpireGuestCodOnce(far);
    expect(r.skipped).toBe(false);
    if (!r.skipped) {
      const codes = r.cancelled.map((o) => o.code);
      expect(codes).not.toContain(userOrder.code);
      expect(codes).not.toContain(confirmed);
      expect(codes).not.toContain(online);
    }
    expect(await statusOf(userOrder.code)).toBe('PENDING');
    expect(await statusOf(confirmed)).toBe('CONFIRMED');
    expect(await statusOf(online)).toBe('PENDING_PAYMENT');
    expect(await stockOf(vu.id)).toBe(19);

    // Job hết hạn thanh toán cũng không đụng đơn COD guest.
    const v2 = await mkVariantPrice('job3d');
    const cod = dataOf((await place(v2.id, { phone: newPhone() })).res).code as string;
    await runExpirePendingPaymentsOnce(far);
    expect(await statusOf(cod)).toBe('PENDING');
  });
});

describe('giới hạn đơn COD đang mở của khách vãng lai', () => {
  it('cùng SĐT: đơn thứ 4 -> 409 TOO_MANY_PENDING_ORDERS, giỏ/kho nguyên vẹn; xác nhận 1 đơn thì đặt được', async () => {
    const phone = newPhone();
    const orders: string[] = [];
    for (let i = 0; i < 3; i++) {
      const v = await mkVariantPrice(`lp${i}`);
      const r = await place(v.id, { phone });
      expect(r.res.status).toBe(201);
      orders.push(dataOf(r.res).code);
    }
    const v4 = await mkVariantPrice('lp4', 5);
    const blocked = await place(v4.id, { phone });
    expect(blocked.res.status).toBe(409);
    expect(errOf(blocked.res)).toMatchObject({
      code: 'TOO_MANY_PENDING_ORDERS',
      details: { max: 3 },
    });
    expect(errOf(blocked.res).message).toContain('chờ cửa hàng xác nhận');
    expect(await stockOf(v4.id)).toBe(5);
    const cart = await fx.call('get', '/cart', blocked.who);
    expect(dataOf(cart).items).toHaveLength(1);

    // SĐT viết khác dạng (+84) vẫn là cùng SĐT sau chuẩn hóa.
    const v5 = await mkVariantPrice('lp5');
    const plus84 = await place(v5.id, { phone: `+84${phone.slice(1)}` });
    expect(plus84.res.status).toBe(409);

    // Staff xác nhận 1 đơn -> còn 2 đơn mở -> đặt được.
    await prisma.order.update({ where: { code: orders[0]! }, data: { status: 'CONFIRMED' } });
    const retry = await fx.postOrder(blocked.who, blocked.body);
    expect(retry.status).toBe(201);
    // Giờ lại đủ 3 -> chặn tiếp.
    const v6 = await mkVariantPrice('lp6');
    expect((await place(v6.id, { phone })).res.status).toBe(409);
  });

  it('cùng email (khác SĐT): đơn thứ 4 -> 409; khách hủy 1 đơn thì đặt được', async () => {
    const email = fx.nextEmail();
    const placed: Array<{ code: string; phone: string }> = [];
    for (let i = 0; i < 3; i++) {
      const v = await mkVariantPrice(`le${i}`);
      const phone = newPhone();
      const r = await place(v.id, { email, phone });
      expect(r.res.status).toBe(201);
      placed.push({ code: dataOf(r.res).code, phone });
    }
    const v4 = await mkVariantPrice('le4');
    const upper = await place(v4.id, { email: email.toUpperCase(), phone: newPhone() });
    expect(upper.res.status).toBe(409);
    expect(errOf(upper.res).code).toBe('TOO_MANY_PENDING_ORDERS');

    const cancel = await fx.call(
      'post',
      `/orders/${placed[1]!.code}/cancel`,
      {},
      {
        phone: placed[1]!.phone,
      },
    );
    expect(cancel.status).toBe(200);
    const ok = await fx.postOrder(upper.who, upper.body);
    expect(ok.status).toBe(201);
  });

  it('khác SĐT và khác email thì không bị chặn', async () => {
    const phone = newPhone();
    for (let i = 0; i < 3; i++) {
      const v = await mkVariantPrice(`ln${i}`);
      expect((await place(v.id, { phone })).res.status).toBe(201);
    }
    const other = await mkVariantPrice('ln-other');
    expect((await place(other.id, { phone: newPhone() })).res.status).toBe(201);
  });

  it('đơn của khách có tài khoản không tính vào giới hạn và không bị giới hạn', async () => {
    const user = await fx.mkUser('lu');
    for (let i = 0; i < 4; i++) {
      const v = await mkVariantPrice(`lu${i}`);
      await placeUserOrder(fx, user, [[v.id, 1]]); // luôn thành công, kể cả quá 3 đơn
    }
    // Khách vãng lai dùng đúng SĐT 0912345678 của các đơn trên vẫn đặt được.
    const g = await mkVariantPrice('lu-guest');
    const r = await place(g.id, { phone: '0912345678' });
    expect(r.res.status).toBe(201);
  });

  it('replay Idempotency-Key + cùng body vẫn 200 dù đã đủ giới hạn; key mới thì 409', async () => {
    const phone = newPhone();
    const placed: Awaited<ReturnType<typeof place>>[] = [];
    for (let i = 0; i < 3; i++) {
      const v = await mkVariantPrice(`lr${i}`);
      const r = await place(v.id, { phone });
      expect(r.res.status).toBe(201);
      placed.push(r);
    }
    const last = placed[2]!;
    const replay = await fx.postOrder(last.who, last.body, last.key);
    expect(replay.status).toBe(200);
    expect(dataOf(replay).code).toBe(dataOf(last.res).code);

    const v4 = await mkVariantPrice('lr4');
    const fresh = await place(v4.id, { phone });
    expect(fresh.res.status).toBe(409);
  });

  it('song song cùng SĐT: không vượt giới hạn (3 thành công, còn lại 409, kho không bị trừ thừa)', async () => {
    const phone = newPhone();
    const jobs: Array<{ v: { id: string }; who: Who; body: Record<string, unknown> }> = [];
    for (let i = 0; i < 6; i++) {
      const v = await mkVariantPrice(`lc${i}`, 5);
      const who = await fx.guestWith([[v.id, 1]]);
      jobs.push({
        v,
        who,
        body: fx.guestOrderBody({ contact: { email: fx.nextEmail(), phone } }),
      });
    }
    const results = await Promise.all(jobs.map((j) => fx.postOrder(j.who, j.body)));
    const ok = results.filter((r) => r.status === 201);
    const blocked = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(blocked).toHaveLength(3);
    for (const r of blocked) expect(errOf(r).code).toBe('TOO_MANY_PENDING_ORDERS');
    for (const [i, r] of results.entries()) {
      expect(await stockOf(jobs[i]!.v.id)).toBe(r.status === 201 ? 4 : 5);
    }
    expect(
      await prisma.order.count({ where: { contactPhone: phone, status: 'PENDING', userId: null } }),
    ).toBe(3);
  });
});

describe('captcha tùy chọn cho đơn của khách vãng lai', () => {
  const mkCaptchaApp = (result: TurnstileResult = 'valid') => {
    verify.mockImplementation(async () => result);
    return createApp({
      generalRateLimit: 100_000,
      authRateLimit: 100_000,
      couponRateLimit: 100_000,
      quoteRateLimit: 100_000,
      orderRateLimit: 100_000,
      captchaConfig: { siteKey: SITE_KEY, secretKey: SECRET_KEY },
      captchaVerify: verify,
    });
  };

  it('tắt: bỏ qua captchaToken, không gọi verifier, hành vi cũ', async () => {
    const v = await mkVariantPrice('cap0');
    const r = await place(v.id, { phone: newPhone() }, { captchaToken: 'bat-ky' });
    expect(r.res.status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
    const o = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(r.res).code } });
    expect(JSON.stringify(o)).not.toContain('bat-ky');
  });

  it('bật: thiếu token -> 400 CAPTCHA_FAILED, giỏ/kho nguyên vẹn, không gọi verifier', async () => {
    app = mkCaptchaApp();
    const v = await mkVariantPrice('cap1', 5);
    const r = await place(v.id, { phone: newPhone() });
    expect(r.res.status).toBe(400);
    expect(errOf(r.res).code).toBe('CAPTCHA_FAILED');
    expect(verify).not.toHaveBeenCalled();
    expect(await stockOf(v.id)).toBe(5);
    expect(dataOf(await fx.call('get', '/cart', r.who)).items).toHaveLength(1);
    // Token rỗng/khoảng trắng cũng là thiếu.
    const blank = await fx.postOrder(r.who, { ...r.body, captchaToken: '   ' });
    expect(errOf(blank).code).toBe('CAPTCHA_FAILED');
  });

  it('bật: token sai -> 400; Cloudflare lỗi -> 503 SERVICE_UNAVAILABLE; token đúng -> 201', async () => {
    const v = await mkVariantPrice('cap2', 5);
    app = mkCaptchaApp('invalid');
    const r = await place(v.id, { phone: newPhone() }, { captchaToken: 'tok-sai' });
    expect(r.res.status).toBe(400);
    expect(errOf(r.res).code).toBe('CAPTCHA_FAILED');
    expect(verify).toHaveBeenCalledWith('tok-sai');

    app = mkCaptchaApp('unavailable');
    const down = await fx.postOrder(r.who, { ...r.body, captchaToken: 'tok-x' });
    expect(down.status).toBe(503);
    expect(errOf(down).code).toBe('SERVICE_UNAVAILABLE');
    expect(await stockOf(v.id)).toBe(5);

    app = mkCaptchaApp('valid');
    const ok = await fx.postOrder(r.who, { ...r.body, captchaToken: 'tok-dung' });
    expect(ok.status).toBe(201);
    expect(verify).toHaveBeenLastCalledWith('tok-dung');
    expect(await stockOf(v.id)).toBe(4);
  });

  it('bật: khách đăng nhập không cần token, verifier không được gọi', async () => {
    app = mkCaptchaApp();
    const user = await fx.mkUser('cap3');
    const v = await mkVariantPrice('cap3');
    const order = await placeUserOrder(fx, user, [[v.id, 1]]);
    expect(order.status).toBe('PENDING');
    expect(verify).not.toHaveBeenCalled();
  });

  it('bật: replay cùng Idempotency-Key với token khác/không token vẫn 200 (token không vào vân tay)', async () => {
    app = mkCaptchaApp();
    const v = await mkVariantPrice('cap4', 5);
    const first = await place(v.id, { phone: newPhone() }, { captchaToken: 'tok-1' });
    expect(first.res.status).toBe(201);
    verify.mockClear();

    const sameKeyOtherToken = await fx.postOrder(
      first.who,
      { ...first.body, captchaToken: 'tok-2' },
      first.key,
    );
    expect(sameKeyOtherToken.status).toBe(200);
    expect(dataOf(sameKeyOtherToken).code).toBe(dataOf(first.res).code);
    const noToken: Record<string, unknown> = { ...first.body };
    delete noToken.captchaToken;
    const noTokenReplay = await fx.postOrder(first.who, noToken, first.key);
    expect(noTokenReplay.status).toBe(200);
    expect(verify).not.toHaveBeenCalled(); // replay đi trước captcha
    expect(await stockOf(v.id)).toBe(4);
  });
});

describe('phân loại analytics: đơn COD guest hết hạn là "Hết hạn tự động"', () => {
  beforeAll(async () => {
    // Đơn PENDING còn sót của các test trên sẽ bị job (mốc +49 giờ) hủy lẫn vào số đếm: đưa ra khỏi diện hủy.
    await prisma.order.updateMany({
      where: { contactEmail: { startsWith: PREFIX }, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
  });

  it('cộng vào loại expired với nhãn mới; hủy tay cùng lý do bởi staff vẫn là cửa hàng hủy', async () => {
    const q = { from: vnDateKey(new Date()), to: vnDateKey(new Date()) };
    const before = await getOperations(q);
    const countOf = (op: Awaited<ReturnType<typeof getOperations>>, t: string) =>
      op.cancellations.byType.find((x) => x.type === t)!;
    expect(countOf(before, 'expired').label).toBe('Hết hạn tự động');

    const v = await mkVariantPrice('an1');
    const { res } = await place(v.id, { phone: newPhone() });
    const order = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(res).code } });
    await runExpireGuestCodOnce(new Date(order.createdAt.getTime() + 49 * HOUR));
    expect(await statusOf(order.code)).toBe('CANCELLED');

    // Đơn online hết hạn thanh toán vẫn tính vào cùng loại.
    const v2 = await mkVariantPrice('an2');
    const { res: res2 } = await place(v2.id, { phone: newPhone() });
    const online = await prisma.order.update({
      where: { code: dataOf(res2).code },
      data: {
        status: 'PENDING_PAYMENT',
        paymentMethod: 'VNPAY',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await runExpirePendingPaymentsOnce(new Date());
    expect(await statusOf(online.code)).toBe('CANCELLED');
    expect(
      (
        await prisma.orderStatusHistory.findFirstOrThrow({
          where: { orderId: online.id, toStatus: 'CANCELLED' },
        })
      ).note,
    ).toBe(EXPIRE_REASON);

    const after = await getOperations(q);
    expect(countOf(after, 'expired').current).toBe(countOf(before, 'expired').current + 2);
    expect(after.cancellations.total.current).toBe(before.cancellations.total.current + 2);

    // Staff hủy tay với đúng lý do đó: có actorId nên là "Cửa hàng hủy".
    const staff = await fx.mkUser('an-staff');
    await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
    const v3 = await mkVariantPrice('an3');
    const { res: res3 } = await place(v3.id, { phone: newPhone() });
    const o3 = await prisma.order.findUniqueOrThrow({ where: { code: dataOf(res3).code } });
    await prisma.order.update({ where: { id: o3.id }, data: { status: 'CANCELLED' } });
    await prisma.orderStatusHistory.create({
      data: {
        orderId: o3.id,
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        note: GUEST_COD_EXPIRE_REASON,
        actorId: staff.id,
      },
    });
    const final = await getOperations(q);
    expect(countOf(final, 'expired').current).toBe(countOf(after, 'expired').current);
    expect(countOf(final, 'store').current).toBe(countOf(after, 'store').current + 1);
  });
});
