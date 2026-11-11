import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';
import { API, bearer, ORIGIN, registerUser } from './authHelpers.js';

const PREFIX = 'tm3b-';
const DAY = 24 * 60 * 60 * 1000;

interface Item {
  id: string;
  variantId: string;
  quantity: number;
  product: { id: string; slug: string; name: string; imageUrl: string | null };
  variant: { id: string; sku: string; weightGram: number };
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  unitPriceAtAdd: number;
  maxQuantity: number;
  stockStatus: string;
  warnings: string[];
}
interface CartBody {
  cartToken: string | null;
  items: Item[];
  itemCount: number;
  subtotal: number;
  coupon: {
    code: string;
    type: string | null;
    discount: number;
    valid: boolean;
    invalidReason: string | null;
    minOrder?: number;
  } | null;
  discountTotal: number;
  totalWeightGram: number;
  shippingEstimate: {
    standardFrom: number;
    freeShippingThreshold: number;
    freeShippingRemaining: number;
  };
}

interface Who {
  token?: string | null;
  auth?: Record<string, string>;
}

let app: Express;
let categoryId: string;
const issuedTokens = new Set<string>();
let seq = 0;

async function call(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  who: Who = {},
  body?: Record<string, unknown>,
) {
  let r = request(app)[method](`${API}${path}`).set('Origin', ORIGIN);
  if (who.token) r = r.set('X-Cart-Token', who.token);
  if (who.auth) r = r.set(who.auth);
  if (body) r = r.send(body);
  const res = await r;
  const t = (res.body as { data?: { cartToken?: string | null } }).data?.cartToken;
  if (t) issuedTokens.add(t);
  return res;
}

const cartOf = (res: request.Response) => (res.body as { data: CartBody }).data;
const errOf = (res: request.Response) =>
  (res.body as { error: { code: string; details?: Record<string, unknown> } }).error;

async function mkUser(key: string) {
  const u = await registerUser(app, `${PREFIX}${key}@example.test`);
  expect(u.res.status).toBe(201);
  return { id: u.userId, who: { auth: bearer(u.accessToken) } as Who };
}

async function mkProduct(
  key: string,
  over: { status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'; deletedAt?: Date } = {},
  images: Array<{ url: string; sortOrder: number; isPrimary: boolean }> = [],
) {
  return prisma.product.create({
    data: {
      categoryId,
      name: `Sản phẩm ${key}`,
      slug: `${PREFIX}${key}-${++seq}`,
      status: over.status ?? 'ACTIVE',
      deletedAt: over.deletedAt ?? null,
      images: { create: images },
    },
  });
}

async function mkVariant(
  key: string,
  over: {
    price?: number;
    stock?: number;
    isActive?: boolean;
    deletedAt?: Date;
    productId?: string;
    weightGram?: number;
  } = {},
) {
  const productId = over.productId ?? (await mkProduct(key)).id;
  return prisma.productVariant.create({
    data: {
      productId,
      sku: `TM3B-${key}-${++seq}`.toUpperCase(),
      name: `Biến thể ${key}`,
      attributes: { weight: '500g' },
      price: over.price ?? 100000,
      stock: over.stock ?? 50,
      weightGram: over.weightGram ?? 500,
      isActive: over.isActive ?? true,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

async function mkCoupon(
  key: string,
  over: Partial<{
    type: 'PERCENT' | 'FIXED' | 'FREESHIP';
    value: number;
    maxDiscount: number | null;
    minOrder: number;
    endsAt: Date | null;
    perUserLimit: number | null;
    isActive: boolean;
  }> = {},
) {
  return prisma.coupon.create({
    data: {
      code: `${PREFIX}${key}-${++seq}`.toUpperCase(),
      type: over.type ?? 'PERCENT',
      value: over.value ?? 10,
      maxDiscount: over.maxDiscount ?? null,
      minOrder: over.minOrder ?? 0,
      endsAt: over.endsAt ?? null,
      perUserLimit: over.perUserLimit ?? null,
      isActive: over.isActive ?? true,
    },
  });
}

const add = (who: Who, variantId: string, quantity: number) =>
  call('post', '/cart/items', who, { variantId, quantity });

/** Tạo giỏ guest và trả token. */
async function guestWith(lines: Array<[string, number]>): Promise<Who> {
  let who: Who = {};
  for (const [variantId, quantity] of lines) {
    const res = await add(who, variantId, quantity);
    expect(res.status).toBe(201);
    if (!who.token) who = { token: cartOf(res).cartToken };
  }
  expect(who.token).toBeTruthy();
  return who;
}

async function clean() {
  const items = await prisma.cartItem.findMany({
    where: { variant: { sku: { startsWith: 'TM3B-' } } },
    select: { cartId: true },
  });
  await prisma.cart.deleteMany({
    where: {
      OR: [
        { id: { in: items.map((i) => i.cartId) } },
        { tokenHash: { in: [...issuedTokens].map(sha256Hex) } },
        { user: { email: { startsWith: PREFIX } } },
      ],
    },
  });
  await prisma.couponRedemption.deleteMany({
    where: { coupon: { code: { startsWith: 'TM3B-' } } },
  });
  await prisma.order.deleteMany({ where: { contactEmail: { startsWith: PREFIX } } });
  await prisma.coupon.deleteMany({ where: { code: { startsWith: 'TM3B-' } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIX }, parentId: { not: null } },
  });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  app = createApp({
    generalRateLimit: 100_000,
    authRateLimit: 100_000,
    couponRateLimit: 100_000,
    quoteRateLimit: 100_000,
    orderRateLimit: 100_000,
  });
  await clean();
  const parent = await prisma.category.create({
    data: { name: 'Cha M3B', slug: `${PREFIX}parent` },
  });
  const child = await prisma.category.create({
    data: { name: 'Con M3B', slug: `${PREFIX}child`, parentId: parent.id },
  });
  categoryId = child.id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('GET /cart và cấp token guest', () => {
  it('guest thêm dòng: nhận token ở body + header (được expose); lần sau cartToken null', async () => {
    const v = await mkVariant('tok');
    const r1 = await add({}, v.id, 2);
    expect(r1.status).toBe(201);
    const c1 = cartOf(r1);
    expect(c1.cartToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r1.headers['x-cart-token']).toBe(c1.cartToken);
    expect(String(r1.headers['access-control-expose-headers'])).toContain('X-Cart-Token');

    const who = { token: c1.cartToken };
    const r2 = await add(who, v.id, 2);
    expect(r2.status).toBe(201);
    expect(cartOf(r2).cartToken).toBeNull();
    expect(r2.headers['x-cart-token']).toBeUndefined();
    const c2 = cartOf(r2);
    expect(c2.items).toHaveLength(1);
    expect(c2.items[0]).toMatchObject({
      variantId: v.id,
      quantity: 4,
      unitPrice: 100000,
      listPrice: 100000,
      lineTotal: 400000,
      unitPriceAtAdd: 100000,
      maxQuantity: 20,
      stockStatus: 'IN_STOCK',
      warnings: [],
      variant: { id: v.id, weightGram: 500 },
    });
    expect(c2.itemCount).toBe(4);
    expect(c2.subtotal).toBe(400000);
    expect(c2.totalWeightGram).toBe(2000);
    expect(c2.coupon).toBeNull();
    expect(c2.discountTotal).toBe(0);
    expect(c2.shippingEstimate).toEqual({
      standardFrom: 20000,
      freeShippingThreshold: 500000,
      freeShippingRemaining: 100000,
    });

    const g = await call('get', '/cart', who);
    expect(g.status).toBe(200);
    expect(cartOf(g).cartToken).toBeNull();
    expect(cartOf(g).items).toHaveLength(1);
  });

  it('GET không token / token rác / token chưa tồn tại: giỏ rỗng, không tạo Cart', async () => {
    const before = await prisma.cart.count();
    const empty = {
      cartToken: null,
      items: [],
      itemCount: 0,
      subtotal: 0,
      coupon: null,
      discountTotal: 0,
      totalWeightGram: 0,
      shippingEstimate: {
        standardFrom: 0,
        freeShippingThreshold: 500000,
        freeShippingRemaining: 0,
      },
    };
    for (const token of [undefined, 'rac', 'x'.repeat(43), 'a b'.padEnd(43, 'c'), '!'.repeat(43)]) {
      const res = await call('get', '/cart', { token });
      expect(res.status).toBe(200);
      expect(cartOf(res)).toEqual(empty);
    }
    expect(await prisma.cart.count()).toBe(before);
  });

  it('token hết hạn (31 ngày): GET rỗng; POST xóa giỏ cũ, tạo giỏ + token mới', async () => {
    const v = await mkVariant('exp');
    const who = await guestWith([[v.id, 1]]);
    const hash = sha256Hex(who.token!);
    await prisma.cart.update({
      where: { tokenHash: hash },
      data: { lastActivityAt: new Date(Date.now() - 31 * DAY) },
    });
    const g = await call('get', '/cart', who);
    expect(cartOf(g).items).toEqual([]);

    const p = await add(who, v.id, 1);
    expect(p.status).toBe(201);
    const fresh = cartOf(p).cartToken;
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(who.token);
    expect(cartOf(p).items[0]?.quantity).toBe(1);
    expect(await prisma.cart.findUnique({ where: { tokenHash: hash } })).toBeNull();
  });

  it('GET chỉ cập nhật lastActivityAt khi cũ hơn 1 giờ; ghi luôn cập nhật', async () => {
    const v = await mkVariant('touch');
    const who = await guestWith([[v.id, 1]]);
    const hash = sha256Hex(who.token!);
    const setAt = (ms: number) =>
      prisma.cart.update({ where: { tokenHash: hash }, data: { lastActivityAt: new Date(ms) } });
    const read = async () =>
      (
        await prisma.cart.findUniqueOrThrow({ where: { tokenHash: hash } })
      ).lastActivityAt.getTime();

    const recent = Date.now() - 10 * 60 * 1000;
    await setAt(recent);
    await call('get', '/cart', who);
    expect(await read()).toBe(recent);

    await setAt(Date.now() - 2 * 60 * 60 * 1000);
    await call('get', '/cart', who);
    expect(Date.now() - (await read())).toBeLessThan(60 * 1000);

    await setAt(recent);
    await add(who, v.id, 1);
    expect(Date.now() - (await read())).toBeLessThan(60 * 1000);
  });

  it('imageUrl: ưu tiên isPrimary, rồi sortOrder nhỏ nhất, không ảnh -> null; dòng sắp theo createdAt', async () => {
    const p1 = await mkProduct('img1', {}, [
      { url: '/uploads/a.jpg', sortOrder: 1, isPrimary: false },
      { url: '/uploads/b.jpg', sortOrder: 5, isPrimary: true },
    ]);
    const p2 = await mkProduct('img2', {}, [
      { url: '/uploads/c.jpg', sortOrder: 3, isPrimary: false },
      { url: '/uploads/d.jpg', sortOrder: 2, isPrimary: false },
    ]);
    const v1 = await mkVariant('img1', { productId: p1.id });
    const v2 = await mkVariant('img2', { productId: p2.id });
    const v3 = await mkVariant('img3');
    const who = await guestWith([
      [v1.id, 1],
      [v2.id, 1],
      [v3.id, 1],
    ]);
    const c = cartOf(await call('get', '/cart', who));
    expect(c.items.map((i) => i.variantId)).toEqual([v1.id, v2.id, v3.id]);
    expect(c.items.map((i) => i.product.imageUrl)).toEqual([
      '/uploads/b.jpg',
      '/uploads/d.jpg',
      null,
    ]);
    expect(c.items[0]?.product).toMatchObject({ id: p1.id, slug: p1.slug, name: p1.name });
  });
});

describe('POST /cart/items – lỗi', () => {
  it('validate body', async () => {
    const v = await mkVariant('val');
    for (const body of [
      { variantId: v.id, quantity: 0 },
      { variantId: v.id, quantity: 21 },
      { variantId: v.id, quantity: 1.5 },
      { variantId: v.id },
      { quantity: 1 },
      { variantId: '', quantity: 1 },
    ]) {
      const res = await call('post', '/cart/items', {}, body);
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('tổng > 20 -> 409 QUANTITY_LIMIT_EXCEEDED (kiểm trước tồn kho)', async () => {
    const v = await mkVariant('lim', { stock: 5 });
    const w = await mkVariant('lim2', { stock: 50 });
    const who = await guestWith([[w.id, 20]]);
    const r = await add(who, w.id, 1);
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('QUANTITY_LIMIT_EXCEEDED');
    expect(cartOf(await call('get', '/cart', who)).items[0]?.quantity).toBe(20);

    const who2 = await guestWith([[v.id, 5]]);
    const r2 = await add(who2, v.id, 20);
    expect(errOf(r2).code).toBe('QUANTITY_LIMIT_EXCEEDED');
  });

  it('tổng > tồn -> 409 OUT_OF_STOCK kèm details.items', async () => {
    const v = await mkVariant('oos', { stock: 3 });
    const r = await add({}, v.id, 4);
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('OUT_OF_STOCK');
    expect(errOf(r).details).toEqual({ items: [{ variantId: v.id, requested: 4, available: 3 }] });

    const who = await guestWith([[v.id, 2]]);
    const r2 = await add(who, v.id, 2);
    expect(errOf(r2).details).toEqual({ items: [{ variantId: v.id, requested: 4, available: 3 }] });
    expect(cartOf(await call('get', '/cart', who)).items[0]?.quantity).toBe(2);
  });

  it('thêm lỗi không tạo giỏ guest mới', async () => {
    const v = await mkVariant('nocart', { stock: 1 });
    const before = await prisma.cart.count();
    expect((await add({}, v.id, 2)).status).toBe(409);
    expect((await add({}, 'khong-ton-tai', 1)).status).toBe(404);
    expect(await prisma.cart.count()).toBe(before);
  });

  it('variant/sản phẩm ngừng bán -> 409 ITEM_UNAVAILABLE; không tồn tại -> 404', async () => {
    const inactive = await mkVariant('off', { isActive: false });
    const deleted = await mkVariant('del', { deletedAt: new Date() });
    const archived = await mkVariant('arch', {
      productId: (await mkProduct('arch', { status: 'ARCHIVED' })).id,
    });
    const draft = await mkVariant('draft', {
      productId: (await mkProduct('draft', { status: 'DRAFT' })).id,
    });
    const pDel = await mkVariant('pdel', {
      productId: (await mkProduct('pdel', { deletedAt: new Date() })).id,
    });
    for (const v of [inactive, deleted, archived, draft, pDel]) {
      const r = await add({}, v.id, 1);
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('ITEM_UNAVAILABLE');
    }
    const nf = await add({}, 'cl0000000000000000000000', 1);
    expect(nf.status).toBe(404);
    expect(errOf(nf).code).toBe('NOT_FOUND');
  });
});

describe('PATCH/DELETE dòng', () => {
  it('PATCH đổi số lượng, giữ unitPriceAtAdd; 409 khi vượt tồn; 400 khi sai', async () => {
    const v = await mkVariant('patch', { stock: 6 });
    const who = await guestWith([[v.id, 2]]);
    const item = cartOf(await call('get', '/cart', who)).items[0]!;
    await prisma.productVariant.update({ where: { id: v.id }, data: { price: 120000 } });

    const r = await call('patch', `/cart/items/${item.id}`, who, { quantity: 5 });
    expect(r.status).toBe(200);
    expect(cartOf(r).items[0]).toMatchObject({
      quantity: 5,
      unitPrice: 120000,
      unitPriceAtAdd: 100000,
      warnings: ['PRICE_CHANGED'],
    });

    const over = await call('patch', `/cart/items/${item.id}`, who, { quantity: 7 });
    expect(over.status).toBe(409);
    expect(errOf(over).code).toBe('OUT_OF_STOCK');
    expect(errOf(over).details).toEqual({
      items: [{ variantId: v.id, requested: 7, available: 6 }],
    });

    for (const quantity of [0, 21, 'a']) {
      const bad = await call('patch', `/cart/items/${item.id}`, who, { quantity } as never);
      expect(bad.status).toBe(400);
    }

    await prisma.productVariant.update({ where: { id: v.id }, data: { isActive: false } });
    const off = await call('patch', `/cart/items/${item.id}`, who, { quantity: 1 });
    expect(off.status).toBe(409);
    expect(errOf(off).code).toBe('ITEM_UNAVAILABLE');
  });

  it('DELETE dòng và DELETE /cart', async () => {
    const a = await mkVariant('da');
    const b = await mkVariant('db');
    const who = await guestWith([
      [a.id, 1],
      [b.id, 2],
    ]);
    const items = cartOf(await call('get', '/cart', who)).items;
    const d = await call('delete', `/cart/items/${items[0]!.id}`, who);
    expect(d.status).toBe(200);
    expect(cartOf(d).items.map((i) => i.variantId)).toEqual([b.id]);
    expect((await call('delete', `/cart/items/${items[0]!.id}`, who)).status).toBe(404);

    const all = await call('delete', '/cart', who);
    expect(all.status).toBe(200);
    expect(cartOf(all).items).toEqual([]);
    expect(cartOf(all).subtotal).toBe(0);
  });

  it('không có giỏ: PATCH/DELETE dòng -> 404; DELETE /cart và /cart/coupon -> 200 rỗng, không tạo giỏ', async () => {
    const before = await prisma.cart.count();
    expect((await call('patch', '/cart/items/abc', {}, { quantity: 1 })).status).toBe(404);
    expect((await call('delete', '/cart/items/abc', {})).status).toBe(404);
    for (const path of ['/cart', '/cart/coupon']) {
      const r = await call('delete', path, {});
      expect(r.status).toBe(200);
      expect(cartOf(r).items).toEqual([]);
      expect(cartOf(r).cartToken).toBeNull();
    }
    expect(await prisma.cart.count()).toBe(before);
  });
});

describe('IDOR và định danh giỏ', () => {
  it('PATCH/DELETE dòng của giỏ guest khác / giỏ user -> 404', async () => {
    const v = await mkVariant('idor');
    const guestA = await guestWith([[v.id, 1]]);
    const guestB = await guestWith([[v.id, 1]]);
    const itemA = cartOf(await call('get', '/cart', guestA)).items[0]!;
    const user = await mkUser('idor');
    const rUser = await add(user.who, v.id, 1);
    const itemU = cartOf(rUser).items[0]!;

    for (const [who, itemId] of [
      [guestB, itemA.id],
      [{}, itemA.id],
      [user.who, itemA.id],
      [guestA, itemU.id],
      [{ token: guestA.token }, itemU.id],
    ] as Array<[Who, string]>) {
      const p = await call('patch', `/cart/items/${itemId}`, who, { quantity: 2 });
      expect(p.status).toBe(404);
      expect(errOf(p).code).toBe('NOT_FOUND');
      expect((await call('delete', `/cart/items/${itemId}`, who)).status).toBe(404);
    }
    // Dữ liệu nguyên vẹn
    expect(cartOf(await call('get', '/cart', guestA)).items[0]?.quantity).toBe(1);
    expect(cartOf(await call('get', '/cart', user.who)).items[0]?.quantity).toBe(1);
  });

  it('có Bearer thì bỏ qua X-Cart-Token', async () => {
    const v = await mkVariant('bear');
    const w = await mkVariant('bear2');
    const guest = await guestWith([[v.id, 3]]);
    const user = await mkUser('bear');
    const both: Who = { token: guest.token, auth: user.who.auth };

    const g = await call('get', '/cart', both);
    expect(cartOf(g).items).toEqual([]);
    const a = await add(both, w.id, 1);
    expect(cartOf(a).items.map((i) => i.variantId)).toEqual([w.id]);
    expect(cartOf(a).cartToken).toBeNull();
    expect(a.headers['x-cart-token']).toBeUndefined();
    // giỏ guest không đổi
    expect(cartOf(await call('get', '/cart', guest)).items[0]?.quantity).toBe(3);
  });

  it('token sai với Bearer sai -> 401', async () => {
    const r = await call('get', '/cart', { auth: bearer('khong.hop.le') });
    expect(r.status).toBe(401);
  });
});

describe('warnings', () => {
  it('PRICE_CHANGED', async () => {
    const v = await mkVariant('wprice');
    const who = await guestWith([[v.id, 2]]);
    await prisma.productVariant.update({ where: { id: v.id }, data: { price: 90000 } });
    const c = cartOf(await call('get', '/cart', who));
    expect(c.items[0]).toMatchObject({
      unitPrice: 90000,
      unitPriceAtAdd: 100000,
      lineTotal: 180000,
      warnings: ['PRICE_CHANGED'],
    });
    expect(c.subtotal).toBe(180000);
  });

  it('OUT_OF_STOCK: không tính vào subtotal/itemCount; INSUFFICIENT_STOCK: tính', async () => {
    const a = await mkVariant('wa');
    const b = await mkVariant('wb');
    const c = await mkVariant('wc');
    const who = await guestWith([
      [a.id, 2],
      [b.id, 1],
      [c.id, 3],
    ]);
    await prisma.productVariant.update({ where: { id: a.id }, data: { stock: 0 } });
    await prisma.productVariant.update({ where: { id: c.id }, data: { stock: 1 } });
    const cart = cartOf(await call('get', '/cart', who));
    const [ia, ib, ic] = cart.items;
    expect(ia).toMatchObject({
      warnings: ['OUT_OF_STOCK'],
      maxQuantity: 0,
      stockStatus: 'OUT_OF_STOCK',
    });
    expect(ib?.warnings).toEqual([]);
    expect(ic).toMatchObject({ warnings: ['INSUFFICIENT_STOCK'], maxQuantity: 1 });
    expect(cart.subtotal).toBe(100000 + 300000);
    expect(cart.itemCount).toBe(1 + 3);
    expect(cart.totalWeightGram).toBe(500 + 1500);
  });

  it('UNAVAILABLE: không tính vào subtotal', async () => {
    const a = await mkVariant('ua');
    const b = await mkVariant('ub');
    const who = await guestWith([
      [a.id, 1],
      [b.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: a.id }, data: { isActive: false } });
    const cart = cartOf(await call('get', '/cart', who));
    expect(cart.items[0]?.warnings).toEqual(['UNAVAILABLE']);
    expect(cart.subtotal).toBe(100000);
    expect(cart.itemCount).toBe(1);
  });
});

describe('mã giảm giá', () => {
  it('áp hợp lệ (không phân biệt hoa thường), discount đúng, lưu vào giỏ', async () => {
    const v = await mkVariant('cp');
    const cp = await mkCoupon('ok', { value: 10 });
    const who = await guestWith([[v.id, 2]]);
    const r = await call('post', '/cart/apply-coupon', who, { code: ` ${cp.code.toLowerCase()} ` });
    expect(r.status).toBe(200);
    expect(cartOf(r).coupon).toEqual({
      code: cp.code,
      type: 'PERCENT',
      discount: 20000,
      valid: true,
      invalidReason: null,
    });
    expect(cartOf(r).discountTotal).toBe(20000);
    expect(cartOf(r).shippingEstimate.freeShippingRemaining).toBe(500000 - 180000);
    expect(cartOf(await call('get', '/cart', who)).coupon).toMatchObject({ valid: true });

    const del = await call('delete', '/cart/coupon', who);
    expect(del.status).toBe(200);
    expect(cartOf(del).coupon).toBeNull();
    expect(cartOf(del).discountTotal).toBe(0);
  });

  it('MIN_ORDER kèm minOrder; EXPIRED; NOT_FOUND; INACTIVE: 409 và không lưu', async () => {
    const v = await mkVariant('cpbad');
    const who = await guestWith([[v.id, 1]]);
    const minOrder = await mkCoupon('min', { minOrder: 500000 });
    const expired = await mkCoupon('exp', { endsAt: new Date(Date.now() - DAY) });
    const inactive = await mkCoupon('off', { isActive: false });

    const cases: Array<[string, string, number | undefined]> = [
      [minOrder.code, 'MIN_ORDER', 500000],
      [expired.code, 'EXPIRED', undefined],
      [inactive.code, 'INACTIVE', undefined],
      ['TM3B-KHONG-CO', 'NOT_FOUND', undefined],
    ];
    for (const [code, reason, min] of cases) {
      const r = await call('post', '/cart/apply-coupon', who, { code });
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('COUPON_INVALID');
      expect(errOf(r).details).toEqual(min === undefined ? { reason } : { reason, minOrder: min });
    }
    expect(cartOf(await call('get', '/cart', who)).coupon).toBeNull();

    const bad = await call('post', '/cart/apply-coupon', who, { code: '' });
    expect(bad.status).toBe(400);
  });

  it('giỏ rỗng / không có giỏ -> 409 CART_EMPTY', async () => {
    const cp = await mkCoupon('empty');
    const r = await call('post', '/cart/apply-coupon', {}, { code: cp.code });
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('CART_EMPTY');

    const v = await mkVariant('emptyc');
    const who = await guestWith([[v.id, 1]]);
    const item = cartOf(await call('get', '/cart', who)).items[0]!;
    await call('delete', `/cart/items/${item.id}`, who);
    const r2 = await call('post', '/cart/apply-coupon', who, { code: cp.code });
    expect(errOf(r2).code).toBe('CART_EMPTY');

    // Chỉ có dòng hết hàng cũng coi là rỗng
    const w = await mkVariant('emptyd');
    const who2 = await guestWith([[w.id, 1]]);
    await prisma.productVariant.update({ where: { id: w.id }, data: { stock: 0 } });
    expect(errOf(await call('post', '/cart/apply-coupon', who2, { code: cp.code })).code).toBe(
      'CART_EMPTY',
    );
  });

  it('mã đã áp trở thành không hợp lệ khi giỏ giảm: valid=false, discount 0', async () => {
    const v = await mkVariant('shrink');
    const cp = await mkCoupon('shrink', { minOrder: 150000 });
    const who = await guestWith([[v.id, 2]]);
    expect((await call('post', '/cart/apply-coupon', who, { code: cp.code })).status).toBe(200);
    const item = cartOf(await call('get', '/cart', who)).items[0]!;
    const r = await call('patch', `/cart/items/${item.id}`, who, { quantity: 1 });
    expect(cartOf(r).coupon).toEqual({
      code: cp.code,
      type: 'PERCENT',
      discount: 0,
      valid: false,
      invalidReason: 'MIN_ORDER',
      minOrder: 150000,
    });
    expect(cartOf(r).discountTotal).toBe(0);
  });

  it('thay mã cũ bằng mã mới; FREESHIP có discount 0', async () => {
    const v = await mkVariant('swap');
    const a = await mkCoupon('swapa');
    const b = await mkCoupon('swapb', { type: 'FREESHIP', value: 0 });
    const who = await guestWith([[v.id, 1]]);
    await call('post', '/cart/apply-coupon', who, { code: a.code });
    const r = await call('post', '/cart/apply-coupon', who, { code: b.code });
    expect(cartOf(r).coupon).toMatchObject({
      code: b.code,
      type: 'FREESHIP',
      discount: 0,
      valid: true,
    });
    expect(cartOf(r).discountTotal).toBe(0);
  });

  it('PER_USER_LIMIT cho user (lượt chưa hoàn); lượt đã hoàn không tính; guest không kiểm', async () => {
    const v = await mkVariant('pul');
    const cp = await mkCoupon('pul', { perUserLimit: 1 });
    const user = await mkUser('pul');
    await add(user.who, v.id, 1);

    const order = await prisma.order.create({
      data: {
        code: `TM3B-${++seq}`,
        userId: user.id,
        contactEmail: `${PREFIX}pul@example.test`,
        contactPhone: '0901234567',
        paymentMethod: 'COD',
        shippingMethod: 'STANDARD',
        shippingAddress: {},
        subtotal: 100000,
        shippingFee: 20000,
        grandTotal: 120000,
        idempotencyKey: `tm3b-idem-${seq}`,
        requestFingerprint: 'x',
      },
    });
    const red = await prisma.couponRedemption.create({
      data: {
        couponId: cp.id,
        orderId: order.id,
        userId: user.id,
        email: `${PREFIX}pul@example.test`,
      },
    });

    const r = await call('post', '/cart/apply-coupon', user.who, { code: cp.code });
    expect(r.status).toBe(409);
    expect(errOf(r).details).toEqual({ reason: 'PER_USER_LIMIT' });

    const guest = await guestWith([[v.id, 1]]);
    expect((await call('post', '/cart/apply-coupon', guest, { code: cp.code })).status).toBe(200);

    await prisma.couponRedemption.update({
      where: { id: red.id },
      data: { releasedAt: new Date() },
    });
    expect((await call('post', '/cart/apply-coupon', user.who, { code: cp.code })).status).toBe(
      200,
    );
  });

  it('DELETE /cart xóa cả mã giảm giá', async () => {
    const v = await mkVariant('clr');
    const cp = await mkCoupon('clr');
    const who = await guestWith([[v.id, 1]]);
    await call('post', '/cart/apply-coupon', who, { code: cp.code });
    const r = await call('delete', '/cart', who);
    expect(cartOf(r).coupon).toBeNull();
    const again = await add(who, v.id, 1);
    expect(cartOf(again).coupon).toBeNull();
  });
});

describe('POST /cart/merge', () => {
  it('401 khi không có Bearer', async () => {
    const r = await call('post', '/cart/merge', { token: 'x'.repeat(43) });
    expect(r.status).toBe(401);
  });

  it('cộng dồn theo variant, giữ dòng chỉ có ở giỏ user, xóa giỏ guest, gọi lại -> merged:false', async () => {
    const a = await mkVariant('ma');
    const b = await mkVariant('mb');
    const c = await mkVariant('mc');
    const user = await mkUser('merge1');
    await add(user.who, a.id, 3);
    await add(user.who, c.id, 2);
    const guest = await guestWith([
      [a.id, 2],
      [b.id, 1],
    ]);

    const r = await call('post', '/cart/merge', { ...guest, auth: user.who.auth });
    expect(r.status).toBe(200);
    expect((r.body as { meta: unknown }).meta).toEqual({ merged: true, adjustments: [] });
    const items = cartOf(r).items;
    expect(items.map((i) => [i.variantId, i.quantity])).toEqual([
      [a.id, 5],
      [c.id, 2],
      [b.id, 1],
    ]);
    expect(cartOf(r).cartToken).toBeNull();
    expect(
      await prisma.cart.findUnique({ where: { tokenHash: sha256Hex(guest.token!) } }),
    ).toBeNull();

    const again = await call('post', '/cart/merge', { ...guest, auth: user.who.auth });
    expect(again.status).toBe(200);
    expect((again.body as { meta: unknown }).meta).toEqual({ merged: false, adjustments: [] });
    expect(cartOf(again).items.map((i) => [i.variantId, i.quantity])).toEqual([
      [a.id, 5],
      [c.id, 2],
      [b.id, 1],
    ]);
  });

  it('unitPriceAtAdd: dòng mới lấy của guest, dòng cộng dồn giữ của user', async () => {
    const a = await mkVariant('mp-a');
    const b = await mkVariant('mp-b');
    const user = await mkUser('mprice');
    await add(user.who, a.id, 1); // 100000
    await prisma.productVariant.updateMany({
      where: { id: { in: [a.id, b.id] } },
      data: { price: 110000 },
    });
    const guest = await guestWith([
      [a.id, 1],
      [b.id, 1],
    ]); // guest ghi 110000
    await prisma.productVariant.updateMany({
      where: { id: { in: [a.id, b.id] } },
      data: { price: 120000 },
    });
    const r = await call('post', '/cart/merge', { ...guest, auth: user.who.auth });
    const byVariant = new Map(cartOf(r).items.map((i) => [i.variantId, i]));
    expect(byVariant.get(a.id)).toMatchObject({ quantity: 2, unitPriceAtAdd: 100000 });
    expect(byVariant.get(b.id)).toMatchObject({ quantity: 1, unitPriceAtAdd: 110000 });
  });

  it('chặn 20 (QUANTITY_LIMIT) và chặn tồn (STOCK_LIMIT)', async () => {
    const a = await mkVariant('ml-a', { stock: 50 });
    const b = await mkVariant('ml-b', { stock: 4 });
    const user = await mkUser('mlimit');
    await add(user.who, a.id, 15);
    await add(user.who, b.id, 2);
    const guest = await guestWith([
      [a.id, 10],
      [b.id, 3],
    ]);
    const r = await call('post', '/cart/merge', { ...guest, auth: user.who.auth });
    expect((r.body as { meta: unknown }).meta).toEqual({
      merged: true,
      adjustments: [
        { variantId: a.id, requested: 25, final: 20, reason: 'QUANTITY_LIMIT' },
        { variantId: b.id, requested: 5, final: 4, reason: 'STOCK_LIMIT' },
      ],
    });
    expect(cartOf(r).items.map((i) => [i.variantId, i.quantity])).toEqual([
      [a.id, 20],
      [b.id, 4],
    ]);
  });

  it('bỏ dòng hết hàng (STOCK_LIMIT, final 0) và dòng ngừng bán (UNAVAILABLE)', async () => {
    const out = await mkVariant('mo-out');
    const off = await mkVariant('mo-off');
    const ok = await mkVariant('mo-ok');
    const user = await mkUser('munavail');
    const guest = await guestWith([
      [out.id, 2],
      [off.id, 1],
      [ok.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: out.id }, data: { stock: 0 } });
    await prisma.productVariant.update({ where: { id: off.id }, data: { isActive: false } });
    const r = await call('post', '/cart/merge', { ...guest, auth: user.who.auth });
    expect((r.body as { meta: unknown }).meta).toEqual({
      merged: true,
      adjustments: [
        { variantId: out.id, requested: 2, final: 0, reason: 'STOCK_LIMIT' },
        { variantId: off.id, requested: 1, final: 0, reason: 'UNAVAILABLE' },
      ],
    });
    expect(cartOf(r).items.map((i) => i.variantId)).toEqual([ok.id]);
  });

  it('mã giảm giá: ưu tiên mã của user; user chưa có thì lấy mã guest', async () => {
    const v = await mkVariant('mcoupon');
    const mine = await mkCoupon('mine', { value: 5 });
    const theirs = await mkCoupon('theirs', { value: 20 });

    const u1 = await mkUser('mc1');
    await add(u1.who, v.id, 1);
    await call('post', '/cart/apply-coupon', u1.who, { code: mine.code });
    const g1 = await guestWith([[v.id, 1]]);
    await call('post', '/cart/apply-coupon', g1, { code: theirs.code });
    const r1 = await call('post', '/cart/merge', { ...g1, auth: u1.who.auth });
    expect(cartOf(r1).coupon).toMatchObject({ code: mine.code, valid: true });

    const u2 = await mkUser('mc2');
    const g2 = await guestWith([[v.id, 2]]);
    await call('post', '/cart/apply-coupon', g2, { code: theirs.code });
    const r2 = await call('post', '/cart/merge', { ...g2, auth: u2.who.auth });
    expect(cartOf(r2).coupon).toMatchObject({ code: theirs.code, valid: true, discount: 40000 });
    expect(cartOf(r2).items).toHaveLength(1);
  });

  it('không có header / token rác / token không tồn tại / hết hạn -> không gộp, trả giỏ user', async () => {
    const v = await mkVariant('mnone');
    const user = await mkUser('mnone');
    const empty = await call('post', '/cart/merge', { auth: user.who.auth });
    expect(empty.status).toBe(200);
    expect((empty.body as { meta: unknown }).meta).toEqual({ merged: false, adjustments: [] });
    expect(cartOf(empty).items).toEqual([]);
    expect(await prisma.cart.findUnique({ where: { userId: user.id } })).toBeNull();

    await add(user.who, v.id, 1);
    const guest = await guestWith([[v.id, 4]]);
    await prisma.cart.update({
      where: { tokenHash: sha256Hex(guest.token!) },
      data: { lastActivityAt: new Date(Date.now() - 31 * DAY) },
    });
    for (const token of [undefined, 'rac', 'z'.repeat(43), guest.token!]) {
      const r = await call('post', '/cart/merge', { token, auth: user.who.auth });
      expect(r.status).toBe(200);
      expect((r.body as { meta: unknown }).meta).toEqual({ merged: false, adjustments: [] });
      expect(cartOf(r).items.map((i) => i.quantity)).toEqual([1]);
    }
  });

  it('không gộp giỏ của user khác bằng cách dùng token (token chỉ khớp giỏ guest)', async () => {
    const v = await mkVariant('mother');
    const other = await mkUser('mother');
    await add(other.who, v.id, 1);
    const me = await mkUser('mme');
    // token hợp lệ về định dạng nhưng không khớp tokenHash giỏ nào
    const r = await call('post', '/cart/merge', {
      token: sha256Hex('x').slice(0, 43),
      auth: me.who.auth,
    });
    expect((r.body as { meta: { merged: boolean } }).meta.merged).toBe(false);
    expect(cartOf(await call('get', '/cart', other.who)).items).toHaveLength(1);
  });
});

describe('đồng thời', () => {
  it('3 POST song song cùng variant (10 + 10 + 10): tối đa 20, phần thừa 409, không 500', async () => {
    const v = await mkVariant('conc', { stock: 100 });
    const user = await mkUser('conc');
    const results = await Promise.all([1, 2, 3].map(() => add(user.who, v.id, 10)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 409]);
    const failed = results.find((r) => r.status === 409)!;
    expect(errOf(failed).code).toBe('QUANTITY_LIMIT_EXCEEDED');
    const cart = cartOf(await call('get', '/cart', user.who));
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(20);
    expect(await prisma.cart.count({ where: { userId: user.id } })).toBe(1);
  });

  it('vượt tồn khi song song -> 409 OUT_OF_STOCK, không 500', async () => {
    const v = await mkVariant('conc2', { stock: 15 });
    const user = await mkUser('conc2');
    const results = await Promise.all([1, 2, 3].map(() => add(user.who, v.id, 10)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(cartOf(await call('get', '/cart', user.who)).items[0]?.quantity).toBe(10);
  });
});
