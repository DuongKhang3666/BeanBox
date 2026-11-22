import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getBreakdown } from '../src/modules/admin/analytics/analytics.breakdown.js';
import { getCustomers } from '../src/modules/admin/analytics/analytics.customers.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { getTopCustomers } from '../src/modules/admin/analytics/analytics.top.js';
import { exportDateVn, exportFilename } from '../src/modules/me/me.account.js';
import { API, bearer, login, PW, refreshWith, registerUser, rtOf } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm65-';
const BIG = 100_000;
const PHRASE = 'XOA TAI KHOAN';

let app: Express;
const fx = createFixtures(() => app, PREFIX);
const createdIds: string[] = [];

// 2036-07-15T10:00Z = 17:00 ngày 15/07 giờ VN. Kỳ này 10..15/07.
const NOW = new Date('2036-07-15T10:00:00.000Z');
const Q = { from: '2036-07-10', to: '2036-07-15' } as const;

interface U {
  id: string;
  email: string;
  who: Who;
  token: string;
  rt: string | undefined;
}

async function mkUser(key: string): Promise<U> {
  const email = `${PREFIX}${key}@example.test`;
  const r = await registerUser(app, email);
  expect(r.res.status).toBe(201);
  createdIds.push(r.userId);
  return {
    id: r.userId,
    email,
    who: { auth: bearer(r.accessToken) },
    token: r.accessToken,
    rt: r.rt,
  };
}

let seq = 0;
async function mkOrder(
  u: U,
  variant: { id: string; productId: string },
  over: {
    status?: 'DELIVERED' | 'PENDING' | 'SHIPPING' | 'CANCELLED' | 'PENDING_PAYMENT';
    paid?: boolean;
    paidAt?: string;
    note?: string | null;
    total?: number;
  } = {},
) {
  const total = over.total ?? 150000;
  const paid = over.paid ?? true;
  return prisma.order.create({
    data: {
      code: `BB-T65${++seq}-${randomUUID().slice(0, 6)}`,
      userId: u.id,
      contactEmail: u.email,
      contactPhone: '0912345678',
      status: over.status ?? 'DELIVERED',
      paymentStatus: paid ? 'PAID' : 'UNPAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: {
        fullName: 'Trần Thị Bình',
        phone: '0912345678',
        provinceCode: '48',
        provinceName: 'Thành phố Đà Nẵng',
        wardCode: '20194',
        wardName: 'Phường Hải Châu',
        line1: '45 Nguyễn Huệ',
      },
      subtotal: total,
      shippingFee: 0,
      grandTotal: total,
      note: over.note === undefined ? 'Giao giờ hành chính' : over.note,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(over.paidAt ?? '2036-07-12T03:00:00Z'),
      paidAt: paid ? new Date(over.paidAt ?? '2036-07-12T03:00:00Z') : null,
      items: {
        create: [
          {
            productId: variant.productId,
            variantId: variant.id,
            productName: 'Cà phê thử',
            variantName: 'bt',
            sku: `SKU-${randomUUID().slice(0, 8)}`,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
          },
        ],
      },
      history: { create: [{ fromStatus: null, toStatus: over.status ?? 'DELIVERED' }] },
    },
    include: { items: true },
  });
}

const del = (
  u: { who: Who },
  body: Record<string, unknown> = { password: PW, confirmText: PHRASE },
) => request(app).delete(`${API}/me`).set(u.who.auth!).send(body);
const exportReq = (u: { who: Who }) => request(app).get(`${API}/me/export`).set(u.who.auth!);

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await fx.setup();
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { userId: { in: createdIds } } });
  await prisma.payment.deleteMany({ where: { order: { userId: { in: createdIds } } } });
  await prisma.order.deleteMany({ where: { userId: { in: createdIds } } });
  await prisma.contactMessage.deleteMany({
    where: {
      OR: [
        { email: { startsWith: PREFIX } },
        { userId: { in: createdIds } },
        // Tin cùng email cũ đã bị ẩn danh sang email xóa nên không còn khớp PREFIX.
        { email: { in: createdIds.map((id) => `deleted-${id}@deleted.invalid`) } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdIds } }, { entityId: { in: createdIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  await fx.clean();
  await prisma.$disconnect();
});

describe('DELETE /me: kiểm tra đầu vào và quyền', () => {
  it('không token -> 401', async () => {
    expect((await request(app).delete(`${API}/me`).send({})).status).toBe(401);
  });

  it('sai cụm xác nhận hoặc thiếu mật khẩu -> 400 VALIDATION_ERROR, tài khoản không đổi', async () => {
    const u = await mkUser('val');
    for (const body of [
      { password: PW, confirmText: 'xoa tai khoan' },
      { password: PW, confirmText: `${PHRASE} ` },
      { password: PW },
      { confirmText: PHRASE },
      {},
    ]) {
      const res = await del(u, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.email).toBe(u.email);
    expect(row.deletedAt).toBeNull();
  });

  it('sai mật khẩu -> 400 INVALID_PASSWORD, tính vào đếm đăng nhập sai và khóa tạm sau 5 lần', async () => {
    const u = await mkUser('pw');
    const bad = await del(u, { password: 'SaiMatkhau1', confirmText: PHRASE });
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('INVALID_PASSWORD');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(1);
    for (let i = 0; i < 4; i++) {
      await del(u, { password: 'SaiMatkhau1', confirmText: PHRASE });
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.lockedUntil).not.toBeNull();
    // Đang bị khóa tạm: kể cả mật khẩu đúng cũng không xóa được.
    const locked = await del(u);
    expect(locked.status).toBe(403);
    expect(errOf(locked).code).toBe('ACCOUNT_LOCKED');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt).toBeNull();
  });

  it('STAFF/ADMIN -> 403 FORBIDDEN (kể cả body hợp lệ), tài khoản không đổi', async () => {
    for (const role of ['STAFF', 'ADMIN'] as const) {
      const u = await mkUser(role.toLowerCase());
      await prisma.user.update({ where: { id: u.id }, data: { role } });
      const res = await del(u);
      expect(res.status).toBe(403);
      expect(errOf(res).code).toBe('FORBIDDEN');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt).toBeNull();
    }
  });
});

describe('DELETE /me: chặn khi còn đơn đang xử lý', () => {
  it('409 ACTIVE_ORDERS_EXIST kèm mã đơn (tối đa 10, có total); xong đơn thì xóa được', async () => {
    const u = await mkUser('active');
    const v = await fx.mkVariant('active');
    const codes: string[] = [];
    for (const status of ['PENDING_PAYMENT', 'PENDING', 'SHIPPING'] as const) {
      codes.push((await mkOrder(u, v, { status, paid: false })).code);
    }
    // Đơn đã xong/hủy không chặn.
    await mkOrder(u, v, { status: 'DELIVERED' });
    await mkOrder(u, v, { status: 'CANCELLED', paid: false });

    const res = await del(u);
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('ACTIVE_ORDERS_EXIST');
    const details = errOf(res).details as { orderCodes: string[]; total: number };
    expect([...details.orderCodes].sort()).toEqual([...codes].sort());
    expect(details.total).toBe(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt).toBeNull();

    for (let i = 0; i < 9; i++) await mkOrder(u, v, { status: 'PENDING', paid: false });
    const many = await del(u);
    expect(errOf(many).code).toBe('ACTIVE_ORDERS_EXIST');
    const d2 = errOf(many).details as { orderCodes: string[]; total: number };
    expect(d2.orderCodes).toHaveLength(10);
    expect(d2.total).toBe(12);

    await prisma.order.updateMany({
      where: { userId: u.id, status: { in: ['PENDING', 'PENDING_PAYMENT', 'SHIPPING'] } },
      data: { status: 'DELIVERED' },
    });
    expect((await del(u)).status).toBe(204);
  });
});

describe('DELETE /me: ẩn danh hóa', () => {
  it('xóa đúng từng trường, giữ đơn/đánh giá, thu hồi phiên, giải phóng email, analytics không đổi', async () => {
    const u = await mkUser('full');
    const other = await mkUser('other');
    const v = await fx.mkVariant('full');

    // Dữ liệu liên quan
    await fx.mkAddress(u.id);
    const wlProduct = await fx.mkVariant('wl');
    await prisma.wishlist.create({ data: { userId: u.id, productId: wlProduct.productId } });
    expect((await fx.add(u.who, v.id, 2)).status).toBe(201);
    await prisma.passwordResetToken.create({
      data: { userId: u.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.twoFactorBackupCode.create({ data: { userId: u.id, codeHash: randomUUID() } });
    await prisma.twoFactorChallenge.create({
      data: { userId: u.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.user.update({
      where: { id: u.id },
      data: {
        phone: '0901234567',
        avatarUrl: 'https://example.test/a.png',
        birthDate: new Date('1990-01-02'),
        emailVerifiedAt: new Date(),
        twoFactorEnabledAt: new Date(),
        twoFactorSecretEnc: 'v1:aa:bb:cc',
      },
    });
    const coupon = await fx.mkCoupon('del');
    const order = await mkOrder(u, v, { paidAt: '2036-07-12T03:00:00Z', total: 150000 });
    await prisma.couponRedemption.create({
      data: { couponId: coupon.id, orderId: order.id, userId: u.id, email: u.email },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'VNPAY',
        amount: 150000,
        status: 'SUCCEEDED',
        rawPayload: { vnp_ResponseCode: '00' },
      },
    });
    await prisma.review.create({
      data: {
        productId: v.productId,
        userId: u.id,
        orderItemId: order.items[0]!.id,
        rating: 4,
        content: 'Rang vừa, thơm.',
      },
    });
    await prisma.product.update({
      where: { id: v.productId },
      data: { ratingCount: 1, ratingAvg: 4 },
    });
    const oldEmailUpper = u.email.toUpperCase();
    const msgMine = await prisma.contactMessage.create({
      data: { name: 'An', email: oldEmailUpper, phone: '0901234567', message: 'Cần hỗ trợ đơn' },
    });
    const msgOther = await prisma.contactMessage.create({
      data: { name: 'Người khác', email: other.email, message: 'Tin của người khác' },
    });
    // Đơn của người khác (không bị ảnh hưởng)
    const otherOrder = await mkOrder(other, v, { paidAt: '2036-07-13T03:00:00Z', total: 100000 });

    const before = {
      overview: await getOverview(Q, NOW),
      customers: await getCustomers(Q, NOW),
      province: await getBreakdown({ ...Q, dimension: 'province' }, NOW),
      top: await getTopCustomers(Q, NOW),
    };
    expect(before.top.items.map((i) => i.name)).toContain('Nguyễn Văn An');

    const res = await del(u);
    expect(res.status).toBe(204);
    const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
      c.startsWith('bb_rt='),
    );
    expect(cookie).toMatch(/bb_rt=;/);

    // User
    const anon = `deleted-${u.id}@deleted.invalid`;
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row).toMatchObject({
      email: anon,
      fullName: 'Người dùng đã xóa',
      phone: null,
      birthDate: null,
      avatarUrl: null,
      role: 'CUSTOMER',
      status: 'DISABLED',
      emailVerifiedAt: null,
      twoFactorEnabledAt: null,
      twoFactorSecretEnc: null,
      twoFactorPendingSecretEnc: null,
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.passwordHash).not.toBe('');
    expect(await prisma.address.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.wishlist.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.cart.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { cart: { userId: u.id } } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.twoFactorChallenge.count({ where: { userId: u.id } })).toBe(0);

    // Đơn: giữ userId/số tiền/tỉnh-phường/items/lịch sử, xóa PII
    const o = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, history: true, payments: true },
    });
    expect(o.userId).toBe(u.id);
    expect(o.grandTotal).toBe(150000);
    expect(o.status).toBe('DELIVERED');
    expect(o.contactEmail).toBe(anon);
    expect(o.contactPhone).toBe('');
    expect(o.note).toBeNull();
    expect(o.shippingAddress).toEqual({
      fullName: 'Người dùng đã xóa',
      phone: '',
      provinceCode: '48',
      provinceName: 'Thành phố Đà Nẵng',
      wardCode: '20194',
      wardName: 'Phường Hải Châu',
      line1: '[đã xóa]',
    });
    expect(o.items).toHaveLength(1);
    expect(o.history).toHaveLength(1);
    expect(o.payments[0]!.rawPayload).toEqual({ vnp_ResponseCode: '00' });
    expect(
      (await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).email,
    ).toBe(anon);
    // Đơn người khác không đổi
    const oo = await prisma.order.findUniqueOrThrow({ where: { id: otherOrder.id } });
    expect(oo.contactEmail).toBe(other.email);
    expect(oo.contactPhone).toBe('0912345678');

    // Đánh giá còn, tác giả hiển thị "Người dùng đã xóa"
    expect(await prisma.review.count({ where: { userId: u.id } })).toBe(1);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: v.productId } });
    const reviews = await request(app).get(`${API}/products/${product.slug}/reviews`);
    expect(reviews.status).toBe(200);
    const list = dataOf(reviews) as Array<{ authorName: string; rating: number }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ authorName: 'Người dùng đã xóa', rating: 4 });
    expect(product.ratingCount).toBe(1);

    // Tin nhắn liên hệ: ẩn danh liên hệ, giữ nội dung; tin người khác nguyên vẹn
    const m1 = await prisma.contactMessage.findUniqueOrThrow({ where: { id: msgMine.id } });
    expect(m1).toMatchObject({
      name: 'Người dùng đã xóa',
      email: anon,
      phone: null,
      message: 'Cần hỗ trợ đơn',
    });
    const m2 = await prisma.contactMessage.findUniqueOrThrow({ where: { id: msgOther.id } });
    expect(m2).toMatchObject({ name: 'Người khác', email: other.email });

    // Audit: đúng hành động, không chứa email cũ
    const audit = await prisma.auditLog.findMany({
      where: { actorId: u.id, action: 'user.self_delete' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'User', entityId: u.id, diff: null });
    expect(JSON.stringify(audit[0])).not.toContain(u.email);

    // Phiên: access token cũ 401 ngay, refresh thất bại, đăng nhập thất bại
    const me = await request(app).get(`${API}/me`).set(u.who.auth!);
    expect(me.status).toBe(401);
    expect(errOf(me).code).toBe('UNAUTHORIZED');
    const rf = await refreshWith(app, u.rt);
    expect(rf.status).toBe(401);
    expect((await login(app, u.email)).status).toBe(401);
    expect((await login(app, anon)).status).toBe(401);
    const forgot = await request(app).post(`${API}/auth/forgot-password`).send({ email: u.email });
    expect(forgot.status).toBeLessThan(500);

    // Email cũ đăng ký lại được; tài khoản mới sạch, không liên kết đơn cũ
    const again = await registerUser(app, u.email);
    expect(again.res.status).toBe(201);
    createdIds.push(again.userId);
    expect(again.userId).not.toBe(u.id);
    const mine = await request(app).get(`${API}/me/orders`).set(bearer(again.accessToken));
    expect(mine.status).toBe(200);
    expect(JSON.stringify(dataOf(mine))).not.toContain(order.code);
    expect(again.rt).toBeTruthy();
    expect(rtOf(res)).toBeUndefined();

    // Analytics: doanh thu/số khách/tỉnh không đổi; top-customers hiển thị tên đã xóa
    const after = {
      overview: await getOverview(Q, NOW),
      customers: await getCustomers(Q, NOW),
      province: await getBreakdown({ ...Q, dimension: 'province' }, NOW),
      top: await getTopCustomers(Q, NOW),
    };
    const { generatedAt: _g1, ...ov1 } = before.overview;
    const { generatedAt: _g2, ...ov2 } = after.overview;
    void _g1;
    void _g2;
    expect(ov2).toEqual(ov1);
    const { generatedAt: _g3, ...c1 } = before.customers;
    const { generatedAt: _g4, ...c2 } = after.customers;
    void _g3;
    void _g4;
    expect(c2).toEqual(c1);
    const { generatedAt: _g5, ...p1 } = before.province;
    const { generatedAt: _g6, ...p2 } = after.province;
    void _g5;
    void _g6;
    expect(p2).toEqual(p1);
    expect(p2.groups.some((g) => g.key === '48')).toBe(true);
    const topBefore = before.top.items.find((i) => i.userId === u.id)!;
    const topAfter = after.top.items.find((i) => i.userId === u.id)!;
    expect(topAfter).toMatchObject({
      name: 'Người dùng đã xóa',
      revenue: topBefore.revenue,
      orders: topBefore.orders,
      customerType: 'registered',
    });
    expect(after.top.items).toHaveLength(before.top.items.length);

    // Admin: nhãn Đã xóa, bất biến
    const admin = await mkUser('adm');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const detail = await request(app).get(`${API}/admin/users/${u.id}`).set(admin.who.auth!);
    expect(detail.status).toBe(200);
    expect(dataOf(detail)).toMatchObject({ deleted: true, status: 'DISABLED' });
    const list2 = await request(app).get(`${API}/admin/users?q=deleted-`).set(admin.who.auth!);
    expect(list2.status).toBe(200);
    for (const path of ['status', 'role']) {
      const body = path === 'status' ? { status: 'ACTIVE' } : { role: 'STAFF' };
      const r = await request(app)
        .patch(`${API}/admin/users/${u.id}/${path}`)
        .set(admin.who.auth!)
        .send(body);
      expect(r.status, path).toBe(409);
      expect(errOf(r).code).toBe('ACCOUNT_DELETED');
    }
    // Người dùng thường không có cờ deleted = true
    const normal = await request(app).get(`${API}/admin/users/${other.id}`).set(admin.who.auth!);
    expect(dataOf(normal).deleted).toBe(false);

    // Xóa lần hai (token cũ) -> 401
    expect((await del(u)).status).toBe(401);
  });
});

describe('GET /me/export', () => {
  it('không token -> 401', async () => {
    expect((await request(app).get(`${API}/me/export`)).status).toBe(401);
  });

  it('đủ mục, header đúng, không có trường nhạy cảm, ghi audit không lưu nội dung', async () => {
    const u = await mkUser('exp');
    const v = await fx.mkVariant('exp');
    await prisma.user.update({
      where: { id: u.id },
      data: { phone: '0901234567', twoFactorSecretEnc: 'v1:aa:bb:cc' },
    });
    await fx.mkAddress(u.id);
    await prisma.wishlist.create({ data: { userId: u.id, productId: v.productId } });
    const order = await mkOrder(u, v, { total: 150000 });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'STRIPE',
        providerTxnId: 'pi_secretlooking',
        amount: 150000,
        status: 'SUCCEEDED',
        rawPayload: { id: 'cs_raw_payload_marker' },
      },
    });
    await prisma.review.create({
      data: { productId: v.productId, userId: u.id, orderItemId: order.items[0]!.id, rating: 5 },
    });
    await prisma.contactMessage.create({
      data: { userId: u.id, name: 'An', email: u.email, message: 'Xin chào' },
    });

    const res = await exportReq(u);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    const disp = res.headers['content-disposition'] as string;
    expect(disp).toMatch(
      /^attachment; filename="beanbox-du-lieu-ca-nhan-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(disp).toContain(exportDateVn());

    const text = res.text;
    for (const forbidden of [
      'passwordHash',
      'twoFactorSecretEnc',
      'twoFactorPending',
      'tokenHash',
      'refreshToken',
      'rawPayload',
      'cs_raw_payload_marker',
      'pi_secretlooking',
      'v1:aa:bb:cc',
      'idempotencyKey',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(text.toLowerCase()).not.toContain('token');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(text).not.toContain(user.passwordHash);

    const body = JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(body.formatVersion).toBe(1);
    expect(body.truncated).toBe(false);
    expect(new Date(body.exportedAt as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(body.profile).toMatchObject({
      id: u.id,
      email: u.email,
      fullName: 'Nguyễn Văn An',
      phone: '0901234567',
      role: 'CUSTOMER',
    });
    expect(body.addresses).toHaveLength(1);
    expect(body.addresses[0]).toMatchObject({ line1: '45 Nguyễn Huệ', provinceCode: '79' });
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      code: order.code,
      status: 'DELIVERED',
      grandTotal: 150000,
      contactEmail: u.email,
      note: 'Giao giờ hành chính',
    });
    expect(body.orders[0].items).toHaveLength(1);
    expect(body.orders[0].shippingAddress.line1).toBe('45 Nguyễn Huệ');
    expect(body.orders[0].payments).toEqual([
      expect.objectContaining({ provider: 'STRIPE', status: 'SUCCEEDED', amount: 150000 }),
    ]);
    expect(body.orders[0].statusHistory).toHaveLength(1);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0]).toMatchObject({ rating: 5 });
    expect(body.wishlist).toHaveLength(1);
    expect(body.contactMessages).toHaveLength(1);

    const audit = await prisma.auditLog.findMany({
      where: { actorId: u.id, action: 'user.export' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'User', entityId: u.id, diff: null });
  });

  it('STAFF cũng xuất được dữ liệu của chính mình', async () => {
    const s = await mkUser('expstaff');
    await prisma.user.update({ where: { id: s.id }, data: { role: 'STAFF' } });
    const res = await exportReq(s);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ profile: { role: 'STAFF' }, formatVersion: 1 });
  });

  it('quá 1000 đơn thì cắt và đặt truncated = true', async () => {
    const u = await mkUser('exptrunc');
    const v = await fx.mkVariant('exptrunc');
    const base = new Date('2036-01-01T00:00:00Z').getTime();
    await prisma.order.createMany({
      data: Array.from({ length: 1001 }, (_, i) => ({
        code: `BB-T65X-${u.id.slice(-6)}-${i}`,
        userId: u.id,
        contactEmail: u.email,
        contactPhone: '0912345678',
        status: 'DELIVERED' as const,
        paymentStatus: 'PAID' as const,
        paymentMethod: 'COD' as const,
        shippingMethod: 'STANDARD' as const,
        shippingAddress: { fullName: 'A' },
        subtotal: 1000,
        shippingFee: 0,
        grandTotal: 1000,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'x',
        createdAt: new Date(base + i * 1000),
      })),
    });
    void v;
    const res = await exportReq(u);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text) as { truncated: boolean; orders: Array<{ code: string }> };
    expect(body.truncated).toBe(true);
    expect(body.orders).toHaveLength(1000);
    // Cắt phần cũ nhất: giữ đơn mới nhất đứng đầu.
    expect(body.orders[0]!.code.endsWith('-1000')).toBe(true);
  });

  it('giới hạn 5 lần/giờ/người dùng: lần 6 -> 429; người dùng khác không bị ảnh hưởng', async () => {
    const a = await mkUser('rl-a');
    const b = await mkUser('rl-b');
    for (let i = 0; i < 5; i++) expect((await exportReq(a)).status).toBe(200);
    const sixth = await exportReq(a);
    expect(sixth.status).toBe(429);
    expect(errOf(sixth).code).toBe('RATE_LIMITED');
    expect((await exportReq(b)).status).toBe(200);
  });

  it('tên file dựng từ ngày giờ Việt Nam', () => {
    expect(exportDateVn(new Date('2036-07-15T18:00:00Z'))).toBe('2036-07-16');
    expect(exportFilename(new Date('2036-07-15T10:00:00Z'))).toBe(
      'beanbox-du-lieu-ca-nhan-2036-07-15.json',
    );
  });
});
