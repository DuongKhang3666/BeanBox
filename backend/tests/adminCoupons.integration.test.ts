import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { bearer } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder } from './orderTestHelpers.js';

const PREFIX = 'tm4c-';
const UP = PREFIX.toUpperCase();
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  trackRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
  guestCancelRateLimit: 100_000,
  uploadRateLimit: 100_000,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

let staff: { id: string; who: Who };
let admin: { id: string; who: Who };
let customer: { id: string; who: Who };

const cp = (
  method: 'get' | 'post' | 'patch' | 'delete',
  path = '',
  who: Who = staff.who,
  body?: Record<string, unknown>,
) => fx.call(method, `/admin/coupons${path}`, who, body);

const DAY = 24 * 3600 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function mkRole(key: string, role: 'STAFF' | 'ADMIN' | 'CUSTOMER') {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: u.id }, data: { role } });
  return u;
}

async function cleanAudit() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  // Audit của mọi mã giảm giá do test tạo đều có actor là user của test.
  await prisma.auditLog.deleteMany({
    where: { entity: 'Coupon', actorId: { in: users.map((u) => u.id) } },
  });
}

/** Tạo mã qua API, kiểm 201. */
async function create(code: string, body: Record<string, unknown> = {}) {
  const base = body.type === 'FREESHIP' ? {} : { value: 10 };
  const res = await cp('post', '', staff.who, { code, type: 'PERCENT', ...base, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return dataOf(res) as Json;
}

const fieldsOf = (res: { body: unknown }): string[] =>
  ((errOf(res as never).details ?? []) as Array<{ field: string }>).map((d) => d.field);

beforeAll(async () => {
  app = createApp(BIG);
  await cleanAudit();
  await fx.setup();
  staff = await mkRole('staff', 'STAFF');
  admin = await mkRole('admin', 'ADMIN');
  customer = await mkRole('cust', 'CUSTOMER');
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

describe('phân quyền', () => {
  it('401 không token / sai token; 403 CUSTOMER; 200 STAFF và ADMIN', async () => {
    const q = '?q=' + PREFIX;
    const anon = await cp('get', q, {});
    expect(anon.status).toBe(401);
    expect(errOf(anon).code).toBe('UNAUTHORIZED');
    expect((await cp('get', q, { auth: bearer('abc.def.ghi') })).status).toBe(401);
    const c = await cp('get', q, customer.who);
    expect(c.status).toBe(403);
    expect(errOf(c).code).toBe('FORBIDDEN');
    expect((await cp('get', q, staff.who)).status).toBe(200);
    expect((await cp('get', q, admin.who)).status).toBe(200);
    expect((await cp('post', '', customer.who, { code: UP + 'NOPE', type: 'FIXED' })).status).toBe(
      403,
    );
  });

  it('DELETE: STAFF 403, ADMIN 204', async () => {
    const c = await create(UP + 'DEL1');
    const s = await cp('delete', `/${c.id}`, staff.who);
    expect(s.status).toBe(403);
    expect(errOf(s).code).toBe('FORBIDDEN');
    expect((await cp('get', `/${c.id}`)).status).toBe(200);
    const a = await cp('delete', `/${c.id}`, admin.who);
    expect(a.status).toBe(204);
    expect((await cp('get', `/${c.id}`)).status).toBe(404);
  });

  it('id sai định dạng hoặc không tồn tại -> 404', async () => {
    expect((await cp('get', '/KHONG-HOP-LE')).status).toBe(404);
    expect((await cp('get', '/cknotexist0000')).status).toBe(404);
    expect((await cp('patch', '/cknotexist0000', staff.who, { isActive: false })).status).toBe(404);
    expect((await cp('delete', '/cknotexist0000', admin.who)).status).toBe(404);
  });
});

describe('POST /admin/coupons: tạo và validate', () => {
  it('chuẩn hóa code (trim + uppercase), mặc định, usedCount = 0', async () => {
    const c = await create(`  ${PREFIX}low-1 `);
    expect(c).toMatchObject({
      code: `${UP}LOW-1`,
      type: 'PERCENT',
      value: 10,
      maxDiscount: null,
      minOrder: 0,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      perUserLimit: null,
      usedCount: 0,
      scope: null,
      isActive: true,
      description: null,
      state: 'ACTIVE',
    });
    expect(typeof c.id).toBe('string');
  });

  it('FREESHIP không gửi value -> 0; maxDiscount cho PERCENT/FREESHIP', async () => {
    const f = await create(UP + 'FS1', { type: 'FREESHIP', value: undefined, maxDiscount: 15000 });
    expect(f).toMatchObject({ type: 'FREESHIP', value: 0, maxDiscount: 15000 });
    const p = await create(UP + 'PC1', { maxDiscount: 50000, description: ' Giảm 10% ' });
    expect(p).toMatchObject({ maxDiscount: 50000, description: 'Giảm 10%' });
  });

  it('từng quy tắc validate trả 400 VALIDATION_ERROR kèm field', async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['code quá ngắn', { code: 'AB' }, 'code'],
      ['code ký tự lạ', { code: 'ABC DEF' }, 'code'],
      ['code quá dài', { code: 'A'.repeat(31) }, 'code'],
      ['thiếu type', { type: undefined }, 'type'],
      ['type sai', { type: 'BOGO' }, 'type'],
      ['PERCENT 0', { value: 0 }, 'value'],
      ['PERCENT 101', { value: 101 }, 'value'],
      ['PERCENT thập phân', { value: 10.5 }, 'value'],
      ['FIXED 0', { type: 'FIXED', value: 0 }, 'value'],
      ['FIXED quá trần', { type: 'FIXED', value: 100_000_001 }, 'value'],
      ['FIXED thiếu value', { type: 'FIXED', value: undefined }, 'value'],
      ['FREESHIP value khác 0', { type: 'FREESHIP', value: 5 }, 'value'],
      ['FIXED có maxDiscount', { type: 'FIXED', value: 5000, maxDiscount: 1000 }, 'maxDiscount'],
      ['maxDiscount 0', { maxDiscount: 0 }, 'maxDiscount'],
      ['minOrder âm', { minOrder: -1 }, 'minOrder'],
      ['minOrder quá lớn', { minOrder: 1_000_000_001 }, 'minOrder'],
      ['startsAt sai định dạng', { startsAt: 'mai' }, 'startsAt'],
      ['startsAt >= endsAt', { startsAt: iso(2 * DAY), endsAt: iso(DAY) }, 'endsAt'],
      ['usageLimit 0', { usageLimit: 0 }, 'usageLimit'],
      ['perUserLimit 0', { perUserLimit: 0 }, 'perUserLimit'],
      ['isActive không phải boolean', { isActive: 'yes' }, 'isActive'],
      ['description > 200', { description: 'a'.repeat(201) }, 'description'],
      [
        'scope danh mục không tồn tại',
        { scope: { categoryIds: ['cknotexist0000'] } },
        'scope.categoryIds',
      ],
      [
        'scope sản phẩm không tồn tại',
        { scope: { productIds: ['cknotexist0000'] } },
        'scope.productIds',
      ],
      [
        'scope > 50 danh mục',
        { scope: { categoryIds: Array.from({ length: 51 }, (_, i) => `ck${i}`) } },
        'scope.categoryIds',
      ],
      [
        'scope > 50 sản phẩm',
        { scope: { productIds: Array.from({ length: 51 }, (_, i) => `ck${i}`) } },
        'scope.productIds',
      ],
    ];
    let n = 0;
    for (const [label, over, field] of cases) {
      const body = { code: `${UP}BAD${++n}`, type: 'PERCENT', value: 10, ...over };
      const res = await cp('post', '', staff.who, body);
      expect(res.status, label).toBe(400);
      expect(errOf(res).code, label).toBe('VALIDATION_ERROR');
      expect(fieldsOf(res), label).toContain(field);
    }
    // Không mã nào bị tạo dở.
    expect(await prisma.coupon.count({ where: { code: { startsWith: `${UP}BAD` } } })).toBe(0);
  });

  it('scope hợp lệ: lưu {categoryIds, productIds}, bỏ trùng; rỗng -> null', async () => {
    const v = await fx.mkVariant('scope');
    const category = await prisma.category.findFirstOrThrow({ where: { slug: `${PREFIX}cat` } });
    const c = await create(UP + 'SC1', {
      scope: { categoryIds: [category.id, category.id], productIds: [v.productId] },
    });
    expect(c.scope).toEqual({ categoryIds: [category.id], productIds: [v.productId] });
    const got = dataOf(await cp('get', `/${c.id}`));
    expect(got.scope).toEqual(c.scope);

    const only = await create(UP + 'SC2', { scope: { categoryIds: [category.id] } });
    expect(only.scope).toEqual({ categoryIds: [category.id], productIds: [] });

    for (const [i, scope] of [{}, { categoryIds: [], productIds: [] }, null].entries()) {
      const e = await create(`${UP}SC-E${i}`, { scope });
      expect(e.scope).toBeNull();
      const row = await prisma.coupon.findUniqueOrThrow({ where: { id: e.id } });
      expect(row.scope).toBeNull();
    }
  });

  it('trùng mã -> 409 COUPON_CODE_TAKEN, kể cả khi gửi chữ thường', async () => {
    await create(UP + 'DUP');
    for (const code of [UP + 'DUP', (UP + 'DUP').toLowerCase(), `  ${UP.toLowerCase()}Dup `]) {
      const res = await cp('post', '', staff.who, { code, type: 'PERCENT', value: 5 });
      expect(res.status, code).toBe(409);
      expect(errOf(res)).toMatchObject({ code: 'COUPON_CODE_TAKEN', details: { field: 'code' } });
    }
    expect(await prisma.coupon.count({ where: { code: UP + 'DUP' } })).toBe(1);
  });

  it('ghi AuditLog coupon.create với diff', async () => {
    const c = await create(UP + 'AUD1', { value: 15 });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'coupon.create', entityId: c.id },
    });
    expect(log).toMatchObject({ actorId: staff.id, entity: 'Coupon' });
    expect(log.ip).toBeTruthy();
    expect(log.diff).toMatchObject({
      code: [null, UP + 'AUD1'],
      type: [null, 'PERCENT'],
      value: [null, 15],
    });
  });
});

describe('state, lọc, tìm kiếm, phân trang', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ids.active = (await create(`${UP}ST-ACTIVE`)).id;
    ids.activeWindow = (
      await create(`${UP}ST-WINDOW`, { startsAt: iso(-DAY), endsAt: iso(DAY) })
    ).id;
    ids.scheduled = (
      await create(`${UP}ST-SCHED`, { startsAt: iso(DAY), type: 'FIXED', value: 5000 })
    ).id;
    ids.expired = (
      await create(`${UP}ST-EXPIRED`, { startsAt: iso(-2 * DAY), endsAt: iso(-DAY) })
    ).id;
    ids.inactive = (await create(`${UP}ST-OFF`, { isActive: false })).id;
    ids.exhausted = (await create(`${UP}ST-FULL`, { usageLimit: 3, type: 'FREESHIP' })).id;
    await prisma.coupon.update({ where: { id: ids.exhausted! }, data: { usedCount: 3 } });
    // Ưu tiên: INACTIVE > EXHAUSTED > EXPIRED.
    ids.inactiveFull = (await create(`${UP}ST-OFFFULL`, { isActive: false, usageLimit: 1 })).id;
    await prisma.coupon.update({ where: { id: ids.inactiveFull! }, data: { usedCount: 1 } });
    ids.fullExpired = (
      await create(`${UP}ST-FULLEXP`, { usageLimit: 1, startsAt: iso(-2 * DAY), endsAt: iso(-DAY) })
    ).id;
    await prisma.coupon.update({ where: { id: ids.fullExpired! }, data: { usedCount: 1 } });
    // Còn lượt (usedCount < usageLimit) vẫn ACTIVE.
    ids.partial = (await create(`${UP}ST-PART`, { usageLimit: 5 })).id;
    await prisma.coupon.update({ where: { id: ids.partial! }, data: { usedCount: 4 } });
  });

  const stateOf = async (key: string) => dataOf(await cp('get', `/${ids[key]}`)).state;
  const listIds = async (query: string) => {
    const res = await cp('get', `?q=${UP}ST-&pageSize=100&${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body.data as Json[]).map((c) => c.id as string).sort();
  };
  const idsOf = (...keys: string[]) => keys.map((k) => ids[k]!).sort();

  it('state tính đúng theo thứ tự ưu tiên (GET /:id)', async () => {
    expect(await stateOf('active')).toBe('ACTIVE');
    expect(await stateOf('activeWindow')).toBe('ACTIVE');
    expect(await stateOf('scheduled')).toBe('SCHEDULED');
    expect(await stateOf('expired')).toBe('EXPIRED');
    expect(await stateOf('inactive')).toBe('INACTIVE');
    expect(await stateOf('exhausted')).toBe('EXHAUSTED');
    expect(await stateOf('inactiveFull')).toBe('INACTIVE');
    expect(await stateOf('fullExpired')).toBe('EXHAUSTED');
    expect(await stateOf('partial')).toBe('ACTIVE');
  });

  it('lọc state trong DB khớp với state trả về', async () => {
    expect(await listIds('state=ACTIVE')).toEqual(idsOf('active', 'activeWindow', 'partial'));
    expect(await listIds('state=SCHEDULED')).toEqual(idsOf('scheduled'));
    expect(await listIds('state=EXPIRED')).toEqual(idsOf('expired'));
    expect(await listIds('state=INACTIVE')).toEqual(idsOf('inactive', 'inactiveFull'));
    expect(await listIds('state=EXHAUSTED')).toEqual(idsOf('exhausted', 'fullExpired'));
    // Mỗi item trong danh sách mang state đúng với bộ lọc.
    for (const s of ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'INACTIVE', 'EXHAUSTED']) {
      const res = await cp('get', `?q=${UP}ST-&pageSize=100&state=${s}`);
      for (const item of res.body.data as Json[]) expect(item.state).toBe(s);
    }
    const bad = await cp('get', '?state=NOPE');
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('VALIDATION_ERROR');
  });

  it('lọc type (nhiều giá trị) và q không phân biệt hoa thường', async () => {
    expect(await listIds('type=FIXED')).toEqual(idsOf('scheduled'));
    expect(await listIds('type=FIXED,FREESHIP')).toEqual(idsOf('scheduled', 'exhausted'));
    expect((await cp('get', '?type=NOPE')).status).toBe(400);
    const lower = await cp('get', `?q=${PREFIX}st-sched`);
    expect((lower.body.data as Json[]).map((c) => c.id)).toEqual([ids.scheduled]);
  });

  it('q escape % và _ (chỉ là ký tự thường)', async () => {
    expect(((await cp('get', '?q=%25')).body.data as Json[]).length).toBe(0);
    expect(((await cp('get', `?q=${UP}ST_`)).body.data as Json[]).length).toBe(0); // _ không khớp '-'
    expect(((await cp('get', `?q=${encodeURIComponent('st%')}`)).body.data as Json[]).length).toBe(
      0,
    );
  });

  it('phân trang và sắp xếp createdAt giảm dần', async () => {
    const res = await cp('get', `?q=${UP}ST-&pageSize=4&page=1`);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 4, total: 9, totalPages: 3 });
    const all = (await cp('get', `?q=${UP}ST-&pageSize=100`)).body.data as Json[];
    const times = all.map((c) => Date.parse(c.createdAt as string));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const p3 = await cp('get', `?q=${UP}ST-&pageSize=4&page=3`);
    expect((p3.body.data as Json[]).length).toBe(1);
    expect(((await cp('get', `?q=${UP}ST-&pageSize=4&page=9`)).body.data as Json[]).length).toBe(0);
    expect((await cp('get', '?pageSize=101')).status).toBe(400);
    expect((await cp('get', '?page=0')).status).toBe(400);
  });
});

describe('PATCH /admin/coupons/:id', () => {
  it('không đổi code/type (gửi -> 400); cần >= 1 trường', async () => {
    const c = await create(UP + 'PT1');
    for (const body of [{ code: 'KHAC-1' }, { type: 'FIXED' }]) {
      const res = await cp('patch', `/${c.id}`, staff.who, { isActive: false, ...body });
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    const empty = await cp('patch', `/${c.id}`, staff.who, {});
    expect(empty.status).toBe(400);
    const unknownOnly = await cp('patch', `/${c.id}`, staff.who, { foo: 1 });
    expect(unknownOnly.status).toBe(400);
    expect(dataOf(await cp('get', `/${c.id}`))).toMatchObject({
      code: UP + 'PT1',
      type: 'PERCENT',
      isActive: true,
    });
  });

  it('cập nhật nhiều trường, null xóa trường nullable, audit có diff', async () => {
    const c = await create(UP + 'PT2', {
      maxDiscount: 20000,
      usageLimit: 10,
      endsAt: iso(5 * DAY),
      description: 'cũ',
    });
    const res = await cp('patch', `/${c.id}`, staff.who, {
      value: 20,
      minOrder: 100000,
      maxDiscount: null,
      usageLimit: null,
      endsAt: null,
      perUserLimit: 2,
      description: null,
      isActive: false,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res)).toMatchObject({
      value: 20,
      minOrder: 100000,
      maxDiscount: null,
      usageLimit: null,
      endsAt: null,
      perUserLimit: 2,
      description: null,
      isActive: false,
      state: 'INACTIVE',
      code: UP + 'PT2',
    });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'coupon.update', entityId: c.id },
    });
    expect(log.actorId).toBe(staff.id);
    expect(log.diff).toMatchObject({
      value: [10, 20],
      minOrder: [0, 100000],
      maxDiscount: [20000, null],
      usageLimit: [10, null],
      perUserLimit: [null, 2],
      isActive: [true, false],
    });
    expect(log.diff).not.toHaveProperty('code');
    expect(log.diff).not.toHaveProperty('type');
  });

  it('usageLimit nhỏ hơn usedCount -> 400; bằng usedCount thì được (-> EXHAUSTED)', async () => {
    const c = await create(UP + 'PT3', { usageLimit: 10 });
    await prisma.coupon.update({ where: { id: c.id }, data: { usedCount: 4 } });
    const bad = await cp('patch', `/${c.id}`, staff.who, { usageLimit: 3 });
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('VALIDATION_ERROR');
    expect(fieldsOf(bad)).toContain('usageLimit');
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usageLimit).toBe(10);
    const ok = await cp('patch', `/${c.id}`, staff.who, { usageLimit: 4 });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).state).toBe('EXHAUSTED');
  });

  it('ràng buộc chéo kiểm trên giá trị sau gộp', async () => {
    const c = await create(UP + 'PT4', { startsAt: iso(DAY), endsAt: iso(3 * DAY) });
    // Chỉ gửi startsAt nhưng muộn hơn endsAt hiện có.
    let res = await cp('patch', `/${c.id}`, staff.who, { startsAt: iso(5 * DAY) });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toContain('endsAt');
    // Chỉ gửi endsAt sớm hơn startsAt hiện có.
    res = await cp('patch', `/${c.id}`, staff.who, { endsAt: iso(DAY / 2) });
    expect(res.status).toBe(400);
    // Gửi cả hai hợp lệ.
    res = await cp('patch', `/${c.id}`, staff.who, {
      startsAt: iso(4 * DAY),
      endsAt: iso(6 * DAY),
    });
    expect(res.status).toBe(200);
    // value ngoài khoảng theo type hiện có.
    res = await cp('patch', `/${c.id}`, staff.who, { value: 101 });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toContain('value');

    const fixed = await create(UP + 'PT5', { type: 'FIXED', value: 10000 });
    res = await cp('patch', `/${fixed.id}`, staff.who, { maxDiscount: 5000 });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toContain('maxDiscount');
    res = await cp('patch', `/${fixed.id}`, staff.who, { value: 100_000_001 });
    expect(res.status).toBe(400);

    const free = await create(UP + 'PT6', { type: 'FREESHIP' });
    res = await cp('patch', `/${free.id}`, staff.who, { value: 5 });
    expect(res.status).toBe(400);
    res = await cp('patch', `/${free.id}`, staff.who, { maxDiscount: 12000 });
    expect(res.status).toBe(200);
  });

  it('cập nhật scope: kiểm tồn tại, rỗng/null -> null', async () => {
    const v = await fx.mkVariant('pscope');
    const c = await create(UP + 'PT7');
    let res = await cp('patch', `/${c.id}`, staff.who, {
      scope: { productIds: ['cknotexist0000'] },
    });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toContain('scope.productIds');
    res = await cp('patch', `/${c.id}`, staff.who, { scope: { productIds: [v.productId] } });
    expect(dataOf(res).scope).toEqual({ categoryIds: [], productIds: [v.productId] });
    res = await cp('patch', `/${c.id}`, staff.who, { scope: {} });
    expect(res.status).toBe(200);
    expect(dataOf(res).scope).toBeNull();
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).scope).toBeNull();
  });
});

describe('DELETE /admin/coupons/:id', () => {
  it('mã đã có CouponRedemption/Order -> 409 CONFLICT, mã còn nguyên', async () => {
    const v = await fx.mkVariant('del', { stock: 20, price: 100000 });
    const c = await create(UP + 'USED', { usageLimit: 5 });
    const who = await fx.guestWith([[v.id, 1]]);
    expect((await fx.call('post', '/cart/apply-coupon', who, { code: c.code })).status).toBe(200);
    const order = await fx.postOrder(who, fx.guestOrderBody());
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(dataOf(order).couponCode).toBe(c.code);

    let res = await cp('delete', `/${c.id}`, admin.who);
    expect(res.status).toBe(409);
    expect(errOf(res)).toMatchObject({
      code: 'CONFLICT',
      message: 'Mã đã được dùng, hãy tắt mã thay vì xóa',
    });
    expect((await cp('get', `/${c.id}`)).status).toBe(200);

    // Chỉ còn Order tham chiếu (không còn redemption) vẫn bị chặn.
    await prisma.couponRedemption.deleteMany({ where: { couponId: c.id } });
    res = await cp('delete', `/${c.id}`, admin.who);
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CONFLICT');
    expect(await prisma.coupon.count({ where: { id: c.id } })).toBe(1);
  });

  it('mã chưa dùng xóa được, ghi audit coupon.delete', async () => {
    const c = await create(UP + 'DEL2', { value: 7 });
    expect((await cp('delete', `/${c.id}`, admin.who)).status).toBe(204);
    expect(await prisma.coupon.count({ where: { id: c.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'coupon.delete', entityId: c.id },
    });
    expect(log.actorId).toBe(admin.id);
    expect(log.diff).toMatchObject({ code: [UP + 'DEL2', null], value: [7, null] });
  });
});

describe('tác dụng ngay ở giỏ hàng', () => {
  it('mã tạo qua admin áp được vào giỏ ngay; tắt mã thì giỏ báo không hợp lệ; bật lại thì hợp lệ', async () => {
    const v = await fx.mkVariant('cart', { stock: 20, price: 200000 });
    const c = await create(UP + 'CART', { value: 10, maxDiscount: 15000 });
    const who = await fx.guestWith([[v.id, 1]]);

    const applied = await fx.call('post', '/cart/apply-coupon', who, {
      code: c.code.toLowerCase(),
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(dataOf(applied).coupon).toMatchObject({
      code: c.code,
      type: 'PERCENT',
      valid: true,
      discount: 15000,
    });

    expect((await cp('patch', `/${c.id}`, staff.who, { isActive: false })).status).toBe(200);
    const off = dataOf(await fx.call('get', '/cart', who));
    expect(off.coupon).toMatchObject({ code: c.code, valid: false, invalidReason: 'INACTIVE' });
    expect(off.discountTotal).toBe(0);
    const blocked = await fx.call('post', '/cart/apply-coupon', who, { code: c.code });
    expect(blocked.status).toBe(409);
    expect(errOf(blocked)).toMatchObject({
      code: 'COUPON_INVALID',
      details: { reason: 'INACTIVE' },
    });

    expect((await cp('patch', `/${c.id}`, staff.who, { isActive: true, value: 20 })).status).toBe(
      200,
    );
    const on = dataOf(await fx.call('get', '/cart', who));
    expect(on.coupon).toMatchObject({ valid: true, discount: 15000 });
  });

  it('đơn đã đặt không đổi khi sửa mã', async () => {
    const v = await fx.mkVariant('keep', { stock: 20, price: 100000 });
    const c = await create(UP + 'KEEP', { value: 10 });
    const placed = await (async () => {
      const who = await fx.guestWith([[v.id, 2]]);
      await fx.call('post', '/cart/apply-coupon', who, { code: c.code });
      return dataOf(await fx.postOrder(who, fx.guestOrderBody()));
    })();
    expect(placed.discountTotal).toBe(20000);
    await cp('patch', `/${c.id}`, staff.who, { value: 50 });
    const row = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
    expect(row.discountTotal).toBe(20000);
    // Dùng helper đặt đơn khác để chắc chắn fixture vẫn hoạt động sau khi sửa mã.
    const again = await placeGuestOrder(fx, [[v.id, 1]]);
    expect(again.order.status).toBe('PENDING');
  });
});
