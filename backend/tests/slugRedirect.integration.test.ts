import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { bearer } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6r-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };

let seq = 0;
const slugOf = (key: string) => `${PREFIX}${key}`;

const patchProduct = (id: string, body: Record<string, unknown>, who: Who = admin.who) =>
  fx.call('patch', `/admin/products/${id}`, who, body);
const patchCategory = (id: string, body: Record<string, unknown>, who: Who = admin.who) =>
  fx.call('patch', `/admin/categories/${id}`, who, body);
const getProduct = (slug: string) => fx.call('get', `/products/${slug}`);
const getCategory = (slug: string) => fx.call('get', `/categories/${slug}`);
const redirectRows = (entity: 'PRODUCT' | 'CATEGORY', targetId: string) =>
  prisma.slugRedirect.findMany({
    where: { entity, targetId },
    orderBy: { fromSlug: 'asc' },
    select: { fromSlug: true },
  });

/** Sản phẩm ACTIVE có slug cho trước (ghi thẳng DB, có 1 biến thể đang bán). */
async function mkProduct(slug: string) {
  const v = await fx.mkVariant(`rd${++seq}`);
  const p = await prisma.product.update({ where: { id: v.productId }, data: { slug } });
  return p;
}

async function cleanAll() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await prisma.slugRedirect.deleteMany({ where: { fromSlug: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await cleanAll();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
});
afterAll(async () => {
  await cleanAll();
  await prisma.category.deleteMany({
    where: { parentId: { not: null }, slug: { startsWith: PREFIX } },
  });
  await fx.clean();
  await prisma.$disconnect();
});

describe('redirect slug sản phẩm', () => {
  it('đổi slug -> slug cũ 404 + movedTo; đổi tiếp -> mọi slug cũ trỏ slug mới nhất', async () => {
    const p = await mkProduct(slugOf('p1'));
    expect((await getProduct(slugOf('p1'))).status).toBe(200);

    expect((await patchProduct(p.id, { slug: slugOf('p2') })).status).toBe(200);
    const r1 = await getProduct(slugOf('p1'));
    expect(r1.status).toBe(404);
    expect(errOf(r1).code).toBe('NOT_FOUND');
    expect(errOf(r1).details).toEqual({ movedTo: slugOf('p2') });
    const direct = await getProduct(slugOf('p2'));
    expect(direct.status).toBe(200);
    expect(dataOf(direct).slug).toBe(slugOf('p2'));

    expect((await patchProduct(p.id, { slug: slugOf('p3') })).status).toBe(200);
    for (const old of ['p1', 'p2']) {
      const r = await getProduct(slugOf(old));
      expect(r.status).toBe(404);
      expect(errOf(r).details).toEqual({ movedTo: slugOf('p3') });
    }
    expect(await redirectRows('PRODUCT', p.id)).toEqual([
      { fromSlug: slugOf('p1') },
      { fromSlug: slugOf('p2') },
    ]);
  });

  it('đổi về slug cũ -> redirect đó bị xóa và khớp trực tiếp', async () => {
    const p = await mkProduct(slugOf('b1'));
    await patchProduct(p.id, { slug: slugOf('b2') });
    await patchProduct(p.id, { slug: slugOf('b3') });
    expect((await patchProduct(p.id, { slug: slugOf('b1') })).status).toBe(200);

    expect(await redirectRows('PRODUCT', p.id)).toEqual([
      { fromSlug: slugOf('b2') },
      { fromSlug: slugOf('b3') },
    ]);
    const direct = await getProduct(slugOf('b1'));
    expect(direct.status).toBe(200);
    expect(dataOf(direct).id).toBe(p.id);
    for (const old of ['b2', 'b3']) {
      expect(errOf(await getProduct(slugOf(old))).details).toEqual({ movedTo: slugOf('b1') });
    }
  });

  it('sản phẩm khác lấy slug cũ -> khớp trực tiếp được ưu tiên và redirect bị xóa', async () => {
    const a = await mkProduct(slugOf('c1'));
    await patchProduct(a.id, { slug: slugOf('c2') });
    expect(await redirectRows('PRODUCT', a.id)).toEqual([{ fromSlug: slugOf('c1') }]);

    const b = await mkProduct(slugOf('c-other'));
    expect((await patchProduct(b.id, { slug: slugOf('c1') })).status).toBe(200);

    const res = await getProduct(slugOf('c1'));
    expect(res.status).toBe(200);
    expect(dataOf(res).id).toBe(b.id);
    expect(await redirectRows('PRODUCT', a.id)).toEqual([]);
    // Chỉ khi redirect còn nhưng slug đã khớp trực tiếp thì cũng ưu tiên trực tiếp.
    await prisma.slugRedirect.create({
      data: { entity: 'PRODUCT', fromSlug: slugOf('c1'), targetId: a.id },
    });
    expect(dataOf(await getProduct(slugOf('c1'))).id).toBe(b.id);
  });

  it('PATCH không đổi slug (hoặc gửi lại slug hiện tại) không tạo redirect', async () => {
    const p = await mkProduct(slugOf('n1'));
    expect((await patchProduct(p.id, { name: 'Tên mới' })).status).toBe(200);
    expect((await patchProduct(p.id, { slug: slugOf('n1') })).status).toBe(200);
    expect(await redirectRows('PRODUCT', p.id)).toEqual([]);
  });

  it('trùng slug đang dùng -> 409 và không để lại redirect', async () => {
    const a = await mkProduct(slugOf('d1'));
    await mkProduct(slugOf('d2'));
    const res = await patchProduct(a.id, { slug: slugOf('d2') });
    expect(res.status).toBe(409);
    expect(await redirectRows('PRODUCT', a.id)).toEqual([]);
  });

  it('sản phẩm đích bị ẩn hoặc xóa -> 404 thường, không movedTo', async () => {
    const p = await mkProduct(slugOf('h1'));
    await patchProduct(p.id, { slug: slugOf('h2') });
    expect(errOf(await getProduct(slugOf('h1'))).details).toEqual({ movedTo: slugOf('h2') });

    expect((await patchProduct(p.id, { status: 'DRAFT' })).status).toBe(200);
    const hidden = await getProduct(slugOf('h1'));
    expect(hidden.status).toBe(404);
    expect(errOf(hidden).details).toBeUndefined();

    expect((await patchProduct(p.id, { status: 'ACTIVE' })).status).toBe(200);
    expect(errOf(await getProduct(slugOf('h1'))).details).toEqual({ movedTo: slugOf('h2') });
    expect((await fx.call('delete', `/admin/products/${p.id}`, admin.who)).status).toBe(204);
    const deleted = await getProduct(slugOf('h1'));
    expect(deleted.status).toBe(404);
    expect(errOf(deleted).details).toBeUndefined();
    // Redirect của sản phẩm xóa mềm được giữ.
    expect(await redirectRows('PRODUCT', p.id)).toEqual([{ fromSlug: slugOf('h1') }]);
  });

  it('slug không tồn tại -> 404 thường', async () => {
    const res = await getProduct(slugOf('khong-co'));
    expect(res.status).toBe(404);
    expect(errOf(res).details).toBeUndefined();
  });

  it('reviews theo slug cũ -> 404 + movedTo (danh sách và /me)', async () => {
    const p = await mkProduct(slugOf('rv1'));
    await patchProduct(p.id, { slug: slugOf('rv2') });

    const list = await fx.call('get', `/products/${slugOf('rv1')}/reviews`);
    expect(list.status).toBe(404);
    expect(errOf(list).details).toEqual({ movedTo: slugOf('rv2') });
    const me = await fx.call('get', `/products/${slugOf('rv1')}/reviews/me`, customer.who);
    expect(me.status).toBe(404);
    expect(errOf(me).details).toEqual({ movedTo: slugOf('rv2') });

    // Slug hiện tại vẫn dùng bình thường
    expect((await fx.call('get', `/products/${slugOf('rv2')}/reviews`)).status).toBe(200);
    expect(
      (await fx.call('get', `/products/${slugOf('rv2')}/reviews/me`, customer.who)).status,
    ).toBe(200);
    // Slug lạ -> 404 thường
    const none = await fx.call('get', `/products/${slugOf('rv-none')}/reviews`);
    expect(none.status).toBe(404);
    expect(errOf(none).details).toBeUndefined();
    void bearer;
  });
});

describe('khôi phục sản phẩm', () => {
  const restore = (id: string, who: Who = admin.who) =>
    fx.call('post', `/admin/products/${id}/restore`, who);

  it('Staff 403, khách 403, không token 401', async () => {
    const p = await mkProduct(slugOf('rs0'));
    expect((await restore(p.id, staff.who)).status).toBe(403);
    expect((await restore(p.id, customer.who)).status).toBe(403);
    expect((await restore(p.id, {})).status).toBe(401);
  });

  it('chưa xóa -> 409 CONFLICT; không tồn tại hoặc id sai định dạng -> 404', async () => {
    const p = await mkProduct(slugOf('rs1'));
    const res = await restore(p.id);
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CONFLICT');
    expect((await restore('khongtontai1')).status).toBe(404);
    expect((await restore('SAI-ĐỊNH-DẠNG')).status).toBe(404);
  });

  it('khôi phục: DRAFT, ẩn khỏi public cho đến khi bật ACTIVE, ghi audit', async () => {
    const p = await mkProduct(slugOf('rs2'));
    expect((await fx.call('delete', `/admin/products/${p.id}`, admin.who)).status).toBe(204);
    expect((await getProduct(p.slug)).status).toBe(404);

    const res = await restore(p.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res)).toMatchObject({ id: p.id, slug: p.slug, status: 'DRAFT' });
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.deletedAt).toBeNull();
    expect(row.status).toBe('DRAFT');
    expect((await getProduct(p.slug)).status).toBe(404); // DRAFT chưa hiện

    // Restore lần hai: không còn ở trạng thái đã xóa
    expect((await restore(p.id)).status).toBe(409);

    expect((await patchProduct(p.id, { status: 'ACTIVE' })).status).toBe(200);
    const pub = await getProduct(p.slug);
    expect(pub.status).toBe(200);
    expect(dataOf(pub).id).toBe(p.id);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'product.restore', entityId: p.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: admin.id, entity: 'Product' });
    expect(logs[0]!.diff).toMatchObject({ status: ['ARCHIVED', 'DRAFT'] });
  });

  it('tính lại denormalize (inStock/minPrice) và giữ nguyên biến thể đã xóa', async () => {
    const p = await mkProduct(slugOf('rs3'));
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: p.id } });
    await prisma.productVariant.update({ where: { id: v.id }, data: { stock: 7 } });
    await fx.call('delete', `/admin/products/${p.id}`, admin.who);
    const deadVariant = await prisma.productVariant.create({
      data: {
        productId: p.id,
        sku: `${PREFIX}DEAD-${++seq}`.toUpperCase(),
        name: 'Đã xóa',
        price: 50000,
        stock: 3,
        deletedAt: new Date(),
      },
    });

    const res = await restore(p.id);
    expect(res.status).toBe(200);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.inStock).toBe(true);
    expect(row.minPrice).toBe(v.price);
    const dead = await prisma.productVariant.findUniqueOrThrow({ where: { id: deadVariant.id } });
    expect(dead.deletedAt).not.toBeNull();
  });
});

describe('GET /categories/:slug và redirect danh mục', () => {
  it('trả danh mục active kèm parent/children (chỉ con active)', async () => {
    const parent = await prisma.category.create({
      data: { name: 'Cha', slug: slugOf('cp'), description: 'Mô tả cha', sortOrder: 1 },
    });
    const child = await prisma.category.create({
      data: { name: 'Con A', slug: slugOf('cc1'), parentId: parent.id, sortOrder: 2 },
    });
    await prisma.category.create({
      data: { name: 'Con B', slug: slugOf('cc2'), parentId: parent.id, sortOrder: 1 },
    });
    await prisma.category.create({
      data: { name: 'Con ẩn', slug: slugOf('cc3'), parentId: parent.id, isActive: false },
    });

    const p = await getCategory(slugOf('cp'));
    expect(p.status).toBe(200);
    expect(dataOf(p)).toEqual({
      id: parent.id,
      name: 'Cha',
      slug: slugOf('cp'),
      description: 'Mô tả cha',
      imageUrl: null,
      parent: null,
      children: [
        { name: 'Con B', slug: slugOf('cc2') },
        { name: 'Con A', slug: slugOf('cc1') },
      ],
    });
    const c = await getCategory(slugOf('cc1'));
    expect(dataOf(c)).toMatchObject({
      id: child.id,
      parent: { name: 'Cha', slug: slugOf('cp') },
      children: [],
    });
  });

  it('danh mục ẩn hoặc không tồn tại -> 404 thường; slug sai định dạng -> 404', async () => {
    await prisma.category.create({
      data: { name: 'Ẩn', slug: slugOf('chid'), isActive: false },
    });
    for (const s of [slugOf('chid'), slugOf('khong-co'), 'SAI_DINH_DANG']) {
      const res = await getCategory(s);
      expect(res.status, s).toBe(404);
      expect(errOf(res).details).toBeUndefined();
    }
  });

  it('đổi slug -> slug cũ 404 + movedTo; đổi tiếp và đổi về slug cũ', async () => {
    const cat = await prisma.category.create({ data: { name: 'Đổi', slug: slugOf('k1') } });
    expect((await patchCategory(cat.id, { slug: slugOf('k2') })).status).toBe(200);
    const r1 = await getCategory(slugOf('k1'));
    expect(r1.status).toBe(404);
    expect(errOf(r1).details).toEqual({ movedTo: slugOf('k2') });
    expect((await getCategory(slugOf('k2'))).status).toBe(200);

    await patchCategory(cat.id, { slug: slugOf('k3') });
    for (const old of ['k1', 'k2']) {
      expect(errOf(await getCategory(slugOf(old))).details).toEqual({ movedTo: slugOf('k3') });
    }

    await patchCategory(cat.id, { slug: slugOf('k1') });
    expect(dataOf(await getCategory(slugOf('k1'))).id).toBe(cat.id);
    expect(await redirectRows('CATEGORY', cat.id)).toEqual([
      { fromSlug: slugOf('k2') },
      { fromSlug: slugOf('k3') },
    ]);
  });

  it('danh mục khác lấy slug cũ -> khớp trực tiếp ưu tiên', async () => {
    const a = await prisma.category.create({ data: { name: 'A', slug: slugOf('m1') } });
    await patchCategory(a.id, { slug: slugOf('m2') });
    const b = await prisma.category.create({ data: { name: 'B', slug: slugOf('m-other') } });
    expect((await patchCategory(b.id, { slug: slugOf('m1') })).status).toBe(200);
    expect(dataOf(await getCategory(slugOf('m1'))).id).toBe(b.id);
    expect(await redirectRows('CATEGORY', a.id)).toEqual([]);
  });

  it('danh mục đích bị ẩn -> 404 không movedTo; xóa danh mục -> xóa redirect của nó', async () => {
    const cat = await prisma.category.create({ data: { name: 'Ẩn sau', slug: slugOf('x1') } });
    await patchCategory(cat.id, { slug: slugOf('x2') });
    expect((await patchCategory(cat.id, { isActive: false })).status).toBe(200);
    const hidden = await getCategory(slugOf('x1'));
    expect(hidden.status).toBe(404);
    expect(errOf(hidden).details).toBeUndefined();

    expect(await redirectRows('CATEGORY', cat.id)).toHaveLength(1);
    expect((await fx.call('delete', `/admin/categories/${cat.id}`, admin.who)).status).toBe(204);
    expect(await redirectRows('CATEGORY', cat.id)).toEqual([]);
  });

  it('redirect sản phẩm và danh mục độc lập theo entity', async () => {
    const cat = await prisma.category.create({ data: { name: 'Ent', slug: slugOf('e1') } });
    await patchCategory(cat.id, { slug: slugOf('e2') });
    expect((await getProduct(slugOf('e1'))).status).toBe(404);
    expect(errOf(await getProduct(slugOf('e1'))).details).toBeUndefined();
  });
});
