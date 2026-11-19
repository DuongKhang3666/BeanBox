import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, bearer, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6b-';
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
  reviewRateLimit: 100_000,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type User = { id: string; email: string; who: Who };

let alice: User;
let bob: User;
let categoryId = '';

function call(
  method: 'get' | 'post' | 'delete',
  path: string,
  who: Who = {},
  body?: Record<string, unknown>,
) {
  let r = request(app)[method](`${API}${path}`).set('Origin', ORIGIN);
  if (who.auth) r = r.set(who.auth);
  if (body) r = r.send(body);
  return r;
}

const add = (who: Who, productId: unknown) => call('post', '/me/wishlist', who, { productId });
const list = (who: Who) => call('get', '/me/wishlist', who);
const ids = async (who: Who) =>
  (dataOf(await call('get', '/me/wishlist/ids', who)).productIds as string[]).slice().sort();

async function mkProductId(key: string, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') {
  return (await fx.mkVariant(key, { status })).productId;
}

beforeAll(async () => {
  app = createApp(BIG);
  await fx.setup();
  categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: `${PREFIX}cat` } })).id;
  alice = await fx.mkUser('alice');
  bob = await fx.mkUser('bob');
});
afterAll(async () => {
  await fx.clean();
  await prisma.$disconnect();
});

describe('xác thực', () => {
  it('401 cho cả 4 endpoint khi thiếu hoặc sai token', async () => {
    const bad = { auth: bearer('x.y.z') };
    for (const who of [{}, bad]) {
      expect((await call('get', '/me/wishlist', who)).status).toBe(401);
      expect((await call('get', '/me/wishlist/ids', who)).status).toBe(401);
      expect((await call('post', '/me/wishlist', who, { productId: 'abc' })).status).toBe(401);
      expect((await call('delete', '/me/wishlist/abc', who)).status).toBe(401);
    }
  });
});

describe('thêm / xóa', () => {
  it('thêm mới 201, thêm lại 200 (idempotent, giữ addedAt), danh sách là ProductListItem + addedAt', async () => {
    const p1 = await mkProductId('w1');
    const p2 = await mkProductId('w2');

    const first = await add(alice.who, p1);
    expect(first.status).toBe(201);
    expect(Object.keys(dataOf(first)).sort()).toEqual(['addedAt', 'productId']);
    expect(dataOf(first).productId).toBe(p1);

    const again = await add(alice.who, p1);
    expect(again.status).toBe(200);
    expect(dataOf(again)).toEqual(dataOf(first));

    expect((await add(alice.who, p2)).status).toBe(201);
    expect(await prisma.wishlist.count({ where: { userId: alice.id } })).toBe(2);

    const res = await list(alice.who);
    expect(res.status).toBe(200);
    const data = res.body.data as Json[];
    expect(data.map((d) => d.id)).toEqual([p2, p1]); // addedAt DESC
    expect(data[0]).toMatchObject({
      id: p2,
      minPrice: 100000,
      compareAtPrice: null,
      isFeatured: false,
      ratingAvg: 0,
      ratingCount: 0,
      coffee: null,
    });
    expect(data[0].addedAt).toBeTruthy();
    expect(data[0].category).toMatchObject({ slug: `${PREFIX}cat` });
    expect(data[0]).toHaveProperty('primaryImage');
    expect(data[0]).toHaveProperty('slug');

    expect(await ids(alice.who)).toEqual([p1, p2].sort());
    // Mỗi user một danh sách riêng
    expect(await ids(bob.who)).toEqual([]);
    expect((await list(bob.who)).body.data).toEqual([]);

    // dọn cho các test sau
    await prisma.wishlist.deleteMany({ where: { userId: alice.id } });
  });

  it('thêm song song cùng sản phẩm: chỉ 1 dòng, không lỗi 5xx', async () => {
    const p = await mkProductId('race');
    const results = await Promise.all([add(bob.who, p), add(bob.who, p), add(bob.who, p)]);
    const codes = results.map((r) => r.status);
    expect(codes.every((c) => c === 200 || c === 201)).toBe(true);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(await prisma.wishlist.count({ where: { userId: bob.id, productId: p } })).toBe(1);
    await prisma.wishlist.deleteMany({ where: { userId: bob.id } });
  });

  it('sản phẩm DRAFT, đã xóa mềm, không tồn tại -> 404; body sai -> 400', async () => {
    const draft = await mkProductId('draft', 'DRAFT');
    const gone = await mkProductId('gone');
    await prisma.product.update({ where: { id: gone }, data: { deletedAt: new Date() } });
    for (const pid of [draft, gone, 'khongtontai']) {
      const res = await add(alice.who, pid);
      expect(res.status, pid).toBe(404);
      expect(errOf(res).code).toBe('NOT_FOUND');
    }
    expect(await prisma.wishlist.count({ where: { userId: alice.id } })).toBe(0);
    for (const body of [undefined, '', 123, null, 'a'.repeat(51), 'a\u0000b']) {
      const res = await add(alice.who, body);
      expect(res.status, String(body)).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('DELETE idempotent: 204 cả khi chưa có / không tồn tại; chỉ xóa của chính mình', async () => {
    const p = await mkProductId('del');
    expect((await add(alice.who, p)).status).toBe(201);
    expect((await add(bob.who, p)).status).toBe(201);

    expect((await call('delete', `/me/wishlist/${p}`, alice.who)).status).toBe(204);
    expect(await ids(alice.who)).toEqual([]);
    expect((await call('delete', `/me/wishlist/${p}`, alice.who)).status).toBe(204);
    expect((await call('delete', '/me/wishlist/khongtontai', alice.who)).status).toBe(204);
    expect((await call('delete', `/me/wishlist/${'a'.repeat(80)}`, alice.who)).status).toBe(204);
    expect((await call('delete', '/me/wishlist/a%00b', alice.who)).status).toBe(204);
    // bob vẫn còn
    expect(await ids(bob.who)).toEqual([p]);
    await prisma.wishlist.deleteMany({ where: { userId: bob.id } });
  });
});

describe('sản phẩm bị ẩn và giới hạn 100', () => {
  it('sản phẩm ẩn/xóa sau khi thêm không hiện trong GET nhưng vẫn còn dòng; hiện lại khi ACTIVE', async () => {
    const a = await mkProductId('hid-a');
    const b = await mkProductId('hid-b');
    const c = await mkProductId('hid-c');
    for (const p of [a, b, c]) expect((await add(alice.who, p)).status).toBe(201);

    await prisma.product.update({ where: { id: a }, data: { status: 'DRAFT' } });
    await prisma.product.update({ where: { id: b }, data: { deletedAt: new Date() } });
    expect(((await list(alice.who)).body.data as Json[]).map((d) => d.id)).toEqual([c]);
    expect(await ids(alice.who)).toEqual([c]);
    expect(await prisma.wishlist.count({ where: { userId: alice.id } })).toBe(3);

    await prisma.product.update({ where: { id: a }, data: { status: 'ACTIVE' } });
    expect(await ids(alice.who)).toEqual([a, c].sort());
    await prisma.wishlist.deleteMany({ where: { userId: alice.id } });
  });

  it('đủ 100 mục (tính cả mục đang ẩn) -> thêm mới 409 WISHLIST_LIMIT; mục đã có vẫn 200; xóa 1 thì thêm được', async () => {
    const user = await fx.mkUser('limit');
    const slugs = Array.from({ length: 100 }, (_, i) => `${PREFIX}lim-${i}`);
    await prisma.product.createMany({
      data: slugs.map((slug, i) => ({
        categoryId,
        name: `Sản phẩm giới hạn ${i}`,
        slug,
        status: 'ACTIVE' as const,
      })),
    });
    const products = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    expect(products).toHaveLength(100);
    // createdAt tăng dần theo thứ tự để kiểm tra sắp xếp
    const base = Date.now() - 1_000_000;
    await prisma.wishlist.createMany({
      data: products.map((p, i) => ({
        userId: user.id,
        productId: p.id,
        createdAt: new Date(base + i * 1000),
      })),
    });

    const extra = await mkProductId('lim-extra');
    const full = await add(user.who, extra);
    expect(full.status).toBe(409);
    expect(errOf(full).code).toBe('WISHLIST_LIMIT');

    // thêm lại mục đã có khi đầy: vẫn 200
    expect((await add(user.who, products[0]!.id)).status).toBe(200);

    // một mục bị ẩn vẫn tính vào giới hạn
    await prisma.product.update({ where: { id: products[5]!.id }, data: { status: 'DRAFT' } });
    const stillFull = await add(user.who, extra);
    expect(stillFull.status).toBe(409);
    expect(errOf(stillFull).code).toBe('WISHLIST_LIMIT');
    const shown = (await list(user.who)).body.data as Json[];
    expect(shown).toHaveLength(99);
    expect(shown[0].id).toBe(products[99]!.id); // mới nhất trước
    expect((await ids(user.who)).length).toBe(99);

    // thêm đồng thời khi còn đúng 1 chỗ: chỉ 1 thành công
    expect((await call('delete', `/me/wishlist/${products[1]!.id}`, user.who)).status).toBe(204);
    const extra2 = await mkProductId('lim-extra2');
    const race = await Promise.all([add(user.who, extra), add(user.who, extra2)]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.wishlist.count({ where: { userId: user.id } })).toBe(100);

    // xóa 1 rồi thêm lại được
    expect((await call('delete', `/me/wishlist/${products[2]!.id}`, user.who)).status).toBe(204);
    const loser = race.find((r) => r.status === 409)!;
    expect(errOf(loser).code).toBe('WISHLIST_LIMIT');
    const retryId = race[0]!.status === 409 ? extra : extra2;
    expect((await add(user.who, retryId)).status).toBe(201);
  });
});
