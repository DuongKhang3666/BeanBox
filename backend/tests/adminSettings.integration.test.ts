import type { Prisma } from '../src/generated/prisma/client.js';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getShopSettings } from '../src/modules/settings/settings.service.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6b-set-';
const BIG = 100_000;
const KEYS = [
  'shipping.rates',
  'shipping.innerCityProvinceCodes',
  'shipping.innerCityWardCodes',
  'shipping.freeShippingThreshold',
  'shipping.weightSurcharge',
  'order.paymentExpiryMinutes',
  'store.contact',
  'home.banners',
];
const FAKE_KEY = 'test.secret';

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let alice: { id: string; who: Who };
let snapshot = new Map<string, Prisma.JsonValue>();

const get = (path: string, who: Who = {}) => {
  let r = request(app).get(`${API}${path}`).set('Origin', ORIGIN);
  if (who.auth) r = r.set(who.auth);
  return r;
};
const put = (body: unknown, who: Who = admin.who) => {
  let r = request(app).put(`${API}/admin/settings`).set('Origin', ORIGIN);
  if (who.auth) r = r.set(who.auth);
  return body === undefined ? r : r.send(body as object);
};
const auditCount = () =>
  prisma.auditLog.count({ where: { action: 'settings.update', actorId: admin.id } });
const dbSet = (key: string, value: Prisma.InputJsonValue) =>
  prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });

async function resetKeys() {
  await prisma.setting.deleteMany({ where: { key: { in: [...KEYS, FAKE_KEY] } } });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  const rows = await prisma.setting.findMany({ where: { key: { in: KEYS } } });
  snapshot = new Map(rows.map((r) => [r.key, r.value]));
  await prisma.auditLog.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  alice = await fx.mkUser('alice');
  await resetKeys(); // chạy từ trạng thái "chưa có key nào" (mặc định)
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: { in: [...KEYS, FAKE_KEY] } } });
  for (const [key, value] of snapshot) {
    await prisma.setting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }
  await prisma.auditLog.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
  await fx.clean();
  await prisma.$disconnect();
});

describe('GET /admin/settings', () => {
  it('mặc định: đủ 8 key, updatedAt null', async () => {
    await resetKeys();
    const res = await get('/admin/settings', admin.who);
    expect(res.status).toBe(200);
    expect(Object.keys(dataOf(res)).sort()).toEqual([...KEYS].sort());
    expect(dataOf(res)['store.contact']).toEqual({
      name: 'BeanBox',
      phone: '',
      email: 'hello@beanbox.local',
      address: '',
    });
    expect(dataOf(res)['home.banners']).toEqual([]);
    expect(dataOf(res)['shipping.rates'].inner.STANDARD).toBe(20000);
    const meta = (res.body as { meta: { updatedAt: Record<string, string | null> } }).meta;
    for (const k of KEYS) expect(meta.updatedAt[k]).toBeNull();
  });

  it('phân quyền: không token 401, CUSTOMER/STAFF 403', async () => {
    for (const m of ['get', 'put'] as const) {
      const r = (who: Who) => (m === 'get' ? get('/admin/settings', who) : put({ a: 1 }, who));
      expect((await r({})).status).toBe(401);
      for (const who of [alice.who, staff.who]) {
        const res = await r(who);
        expect(res.status).toBe(403);
        expect(errOf(res).code).toBe('FORBIDDEN');
      }
    }
  });
});

describe('PUT /admin/settings', () => {
  it('cập nhật hợp lệ: đúng 1 audit, diff chỉ key đổi; lặp lại -> không thêm audit', async () => {
    await resetKeys();
    const before = await auditCount();
    const body = {
      'shipping.rates': {
        inner: { STANDARD: 11000, EXPRESS: 22000 },
        other: { STANDARD: 33000, EXPRESS: 44000 },
      },
      'order.paymentExpiryMinutes': 30,
      'store.contact': {
        name: ' Cửa hàng ',
        email: 'ABC@Example.com',
        phone: '0901 234 567',
        address: '',
      },
      'shipping.innerCityProvinceCodes': ['79', '79', '01'],
      // trùng giá trị mặc định -> không vào diff
      'shipping.freeShippingThreshold': 500000,
    };
    const res = await put(body);
    expect(res.status).toBe(200);
    expect(dataOf(res)['shipping.rates'].inner.STANDARD).toBe(11000);
    expect(dataOf(res)['store.contact']).toEqual({
      name: 'Cửa hàng',
      email: 'abc@example.com',
      phone: '0901234567',
      address: '',
    });
    expect(dataOf(res)['shipping.innerCityProvinceCodes']).toEqual(['79', '01']);
    expect(await auditCount()).toBe(before + 1);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.update', actorId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.entity).toBe('Setting');
    expect(log.entityId).toBeNull();
    const diff = log.diff as Record<string, unknown[]>;
    expect(Object.keys(diff).sort()).toEqual(
      [
        'order.paymentExpiryMinutes',
        'shipping.innerCityProvinceCodes',
        'shipping.rates',
        'store.contact',
      ].sort(),
    );
    expect(diff['order.paymentExpiryMinutes']).toEqual([15, 30]);

    const again = await put(body);
    expect(again.status).toBe(200);
    expect(await auditCount()).toBe(before + 1);

    const meta = (again.body as { meta: { updatedAt: Record<string, string | null> } }).meta;
    expect(meta.updatedAt['shipping.rates']).not.toBeNull();
    expect(meta.updatedAt['shipping.freeShippingThreshold']).toBeNull();
  });

  it('key lạ -> 400 field = tên key; lỗi lồng nhau -> đường dẫn đầy đủ', async () => {
    const unknown = await put({ 'shipping.foo': 1, 'order.paymentExpiryMinutes': 30 });
    expect(unknown.status).toBe(400);
    expect(errOf(unknown).code).toBe('VALIDATION_ERROR');
    expect((errOf(unknown).details as Array<{ field: string }>).map((d) => d.field)).toEqual([
      'shipping.foo',
    ]);

    const nested = await put({
      'shipping.rates': {
        inner: { STANDARD: -1, EXPRESS: 1 },
        other: { STANDARD: 1, EXPRESS: 1 },
      },
      'home.banners': [{ imageUrl: 'https://x.com/a.jpg', alt: 'a', isActive: true }],
    });
    expect(nested.status).toBe(400);
    expect((errOf(nested).details as Array<{ field: string }>).map((d) => d.field).sort()).toEqual([
      'home.banners.0.imageUrl',
      'shipping.rates.inner.STANDARD',
    ]);
  });

  it('body rỗng / không phải object / không body -> 400, không 5xx', async () => {
    for (const b of [{}, [], 'x', undefined]) {
      const res = await put(b);
      expect(res.status, JSON.stringify(b)).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('lỗi một key thì không key nào được ghi', async () => {
    await resetKeys();
    const before = await auditCount();
    const res = await put({
      'order.paymentExpiryMinutes': 30,
      'shipping.freeShippingThreshold': -5,
    });
    expect(res.status).toBe(400);
    expect(await prisma.setting.count({ where: { key: { in: KEYS } } })).toBe(0);
    expect(await auditCount()).toBe(before);
  });

  it('shipping.rates có hiệu lực ngay với getShopSettings (không cache)', async () => {
    const rates = {
      inner: { STANDARD: 1, EXPRESS: 2 },
      other: { STANDARD: 3, EXPRESS: 4 },
    };
    expect((await put({ 'shipping.rates': rates })).status).toBe(200);
    expect((await getShopSettings()).shippingRates).toEqual(rates);
    const rates2 = { ...rates, other: { STANDARD: 9, EXPRESS: 4 } };
    expect((await put({ 'shipping.rates': rates2 })).status).toBe(200);
    expect((await getShopSettings()).shippingRates).toEqual(rates2);
  });
});

describe('GET /settings/public', () => {
  it('đúng shape, whitelist, banner inactive bị lọc, header cache', async () => {
    await resetKeys();
    const wardCodes = ['25747', '25747', '20194'];
    const banners = [
      { imageUrl: '/uploads/a.jpg', alt: 'A', title: 'Tiêu đề', isActive: true, href: '/san-pham' },
      { imageUrl: '/uploads/b.jpg', alt: 'B', isActive: false },
      { imageUrl: '/uploads/c.jpg', alt: 'C', subtitle: 'Phụ', isActive: true },
    ];
    expect(
      (
        await put({
          'shipping.innerCityProvinceCodes': ['79', '01'],
          'shipping.innerCityWardCodes': wardCodes,
          'home.banners': banners,
        })
      ).status,
    ).toBe(200);
    await dbSet(FAKE_KEY, { secret: 'x' });

    const res = await get('/settings/public');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const d = dataOf(res);
    expect(Object.keys(res.body as object)).toEqual(['data']);
    expect(Object.keys(d).sort()).toEqual(['contactCaptcha', 'home', 'order', 'shipping', 'store']);
    expect(Object.keys(d.shipping).sort()).toEqual([
      'freeShippingThreshold',
      'innerCityProvinces',
      'innerCityWardCount',
      'rates',
      'weightSurcharge',
    ]);
    expect(d.shipping.innerCityWardCount).toBe(2);
    expect(d.shipping.innerCityProvinces.map((p: { code: string }) => p.code)).toEqual([
      '79',
      '01',
    ]);
    expect(d.shipping.innerCityProvinces[0]).toEqual({
      code: '79',
      name: 'Thành phố Hồ Chí Minh',
    });
    expect(d.order).toEqual({ paymentExpiryMinutes: 15 });
    expect(d.store).toEqual({
      contact: { name: 'BeanBox', email: 'hello@beanbox.local', phone: '', address: '' },
    });
    expect(d.home.banners).toEqual([
      { imageUrl: '/uploads/a.jpg', alt: 'A', title: 'Tiêu đề', subtitle: '', href: '/san-pham' },
      { imageUrl: '/uploads/c.jpg', alt: 'C', title: '', subtitle: 'Phụ', href: null },
    ]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('isActive');
    expect(text).not.toContain('innerCityWardCodes');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('25747');
  });

  it('giá trị DB sai định dạng -> mặc định, không 500 (admin và public)', async () => {
    await resetKeys();
    await dbSet('shipping.rates', { inner: 'x' });
    await dbSet('shipping.innerCityProvinceCodes', 'abc');
    await dbSet('order.paymentExpiryMinutes', 'nhanh');
    await dbSet('store.contact', { name: 5 });
    await dbSet('home.banners', [{ imageUrl: 'javascript:alert(1)', alt: 'x', isActive: true }]);

    const a = await get('/admin/settings', admin.who);
    expect(a.status).toBe(200);
    expect(dataOf(a)['shipping.rates'].inner.STANDARD).toBe(20000);
    expect(dataOf(a)['home.banners']).toEqual([]);
    expect(dataOf(a)['store.contact'].name).toBe('BeanBox');
    const meta = (a.body as { meta: { updatedAt: Record<string, string | null> } }).meta;
    expect(meta.updatedAt['home.banners']).toBeNull();

    const p = await get('/settings/public');
    expect(p.status).toBe(200);
    expect(dataOf(p).order.paymentExpiryMinutes).toBe(15);
    expect(dataOf(p).home.banners).toEqual([]);
    expect(dataOf(p).shipping.innerCityProvinces).toHaveLength(2);
  });
});
