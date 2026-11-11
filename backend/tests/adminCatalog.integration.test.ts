import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { isValidImageUrl } from '../src/modules/admin/admin.schema.js';
import { bearer } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm4c-';
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

let staff: { id: string; who: Who };
let admin: { id: string; who: Who };
let customer: { id: string; who: Who };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const call = fx.call;
const mkCat = (body: Record<string, unknown>, who: Who = staff.who) =>
  call('post', '/admin/categories', who, body);
const mkBrand = (body: Record<string, unknown>, who: Who = staff.who) =>
  call('post', '/admin/brands', who, body);

async function mkRole(key: string, role: 'STAFF' | 'ADMIN' | 'CUSTOMER') {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: u.id }, data: { role } });
  return u;
}

async function cleanAll() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIX }, parentId: { not: null } },
  });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await fx.clean();
}

beforeAll(async () => {
  app = createApp(BIG);
  await cleanAll();
  await fx.setup();
  staff = await mkRole('staff', 'STAFF');
  admin = await mkRole('admin', 'ADMIN');
  customer = await mkRole('cust', 'CUSTOMER');
});
afterAll(async () => {
  await cleanAll();
  await prisma.$disconnect();
});

const auditOf = (action: string, entityId: string) =>
  prisma.auditLog.findMany({ where: { action, entityId } });

describe('isValidImageUrl', () => {
  it('chấp nhận /uploads/... và https://', () => {
    expect(isValidImageUrl('/uploads/a/b.webp')).toBe(true);
    expect(isValidImageUrl('https://cdn.example.com/a.png')).toBe(true);
  });
  it('từ chối scheme lạ, traversal, // và URL quá dài', () => {
    for (const u of [
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
      'http://example.com/a.png',
      '/uploads/../x',
      '/uploads/%2e%2e/x',
      '/uploads//x',
      '/uploads\\x',
      '/other/x.png',
      'https://',
      '//evil.com/x',
      '',
      '/uploads/' + 'a'.repeat(500),
    ]) {
      expect(isValidImageUrl(u), u).toBe(false);
    }
  });
});

describe('phân quyền danh mục & thương hiệu', () => {
  for (const group of ['categories', 'brands']) {
    it(`${group}: 401 / 403 CUSTOMER / 200 STAFF và ADMIN`, async () => {
      const p = `/admin/${group}`;
      expect((await call('get', p, {})).status).toBe(401);
      expect((await call('get', p, { auth: bearer('abc.def.ghi') })).status).toBe(401);
      const c = await call('get', p, customer.who);
      expect(c.status).toBe(403);
      expect(errOf(c).code).toBe('FORBIDDEN');
      expect((await call('post', p, customer.who, { name: 'tm4c xx' })).status).toBe(403);
      expect((await call('get', p, staff.who)).status).toBe(200);
      expect((await call('get', p, admin.who)).status).toBe(200);
    });
  }

  it('DELETE: STAFF 403, ADMIN 204', async () => {
    const cat = dataOf(await mkCat({ name: 'tm4c Xóa quyền' }));
    expect((await call('delete', `/admin/categories/${cat.id}`, staff.who)).status).toBe(403);
    expect((await call('delete', `/admin/categories/${cat.id}`, customer.who)).status).toBe(403);
    expect((await call('delete', `/admin/categories/${cat.id}`, admin.who)).status).toBe(204);
    const brand = dataOf(await mkBrand({ name: 'tm4c Xóa quyền' }));
    expect((await call('delete', `/admin/brands/${brand.id}`, staff.who)).status).toBe(403);
    expect((await call('delete', `/admin/brands/${brand.id}`, admin.who)).status).toBe(204);
  });
});

describe('danh mục', () => {
  it('tạo không slug: sinh từ tên có dấu; mặc định đúng; audit ghi', async () => {
    const res = await mkCat({ name: 'tm4c Dụng cụ Đặc biệt' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const d = dataOf(res);
    expect(d).toMatchObject({
      parentId: null,
      name: 'tm4c Dụng cụ Đặc biệt',
      slug: 'tm4c-dung-cu-dac-biet',
      description: null,
      imageUrl: null,
      sortOrder: 0,
      isActive: true,
      productCount: 0,
    });
    expect(d.children).toBeUndefined();
    const [a] = await auditOf('category.create', d.id);
    expect(a).toMatchObject({ actorId: staff.id, entity: 'Category' });
    expect(a!.ip).toBeTruthy();
    expect(a!.diff).toMatchObject({
      name: [null, 'tm4c Dụng cụ Đặc biệt'],
      slug: [null, 'tm4c-dung-cu-dac-biet'],
    });
  });

  it('tạo với slug tùy chọn; slug sai định dạng -> 400; không sinh được slug -> 400', async () => {
    const ok = await mkCat({
      name: 'tm4c Có slug',
      slug: 'tm4c-custom-slug',
      description: 'Mô tả',
      imageUrl: '/uploads/a.png',
      sortOrder: 5,
      isActive: false,
    });
    expect(ok.status).toBe(201);
    expect(dataOf(ok)).toMatchObject({
      slug: 'tm4c-custom-slug',
      description: 'Mô tả',
      imageUrl: '/uploads/a.png',
      sortOrder: 5,
      isActive: false,
    });
    expect((await mkCat({ name: 'tm4c Slug sai', slug: 'Tm4c Sai' })).status).toBe(400);
    const bad = await mkCat({ name: '!!' });
    expect(bad.status).toBe(400);
    expect(errOf(bad).details).toEqual([expect.objectContaining({ field: 'slug' })]);
    expect((await mkCat({ name: 'a' })).status).toBe(400);
    expect((await mkCat({ name: 'tm4c ok', sortOrder: 10_000 })).status).toBe(400);
  });

  it('slug trùng -> 409 SLUG_TAKEN; tạo đồng thời cùng slug chỉ một thành công', async () => {
    const first = await mkCat({ name: 'tm4c Trùng', slug: 'tm4c-dup' });
    expect(first.status).toBe(201);
    const dup = await mkCat({ name: 'tm4c Trùng khác', slug: 'tm4c-dup' });
    expect(dup.status).toBe(409);
    expect(errOf(dup)).toMatchObject({ code: 'SLUG_TAKEN', details: { field: 'slug' } });
    const results = await Promise.all([
      mkCat({ name: 'tm4c Race', slug: 'tm4c-race' }),
      mkCat({ name: 'tm4c Race', slug: 'tm4c-race' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('parentId: cấp 3 bị chặn, cha không tồn tại -> 400 field parentId', async () => {
    const root = dataOf(await mkCat({ name: 'tm4c Gốc cha' }));
    const child = await mkCat({ name: 'tm4c Con', parentId: root.id });
    expect(child.status).toBe(201);
    expect(dataOf(child).parentId).toBe(root.id);
    const l3 = await mkCat({ name: 'tm4c Cháu', parentId: dataOf(child).id });
    expect(l3.status).toBe(400);
    expect(errOf(l3).details).toEqual([
      expect.objectContaining({ field: 'parentId', message: 'Chỉ hỗ trợ danh mục 2 cấp' }),
    ]);
    const missing = await mkCat({ name: 'tm4c Mồ côi', parentId: 'clxnotexist000000000' });
    expect(missing.status).toBe(400);
    expect(errOf(missing).details).toEqual([expect.objectContaining({ field: 'parentId' })]);
  });

  it('imageUrl không hợp lệ -> 400 (tạo và sửa)', async () => {
    for (const imageUrl of ['javascript:alert(1)', 'http://x.com/a.png', '/uploads/../x']) {
      const res = await mkCat({ name: 'tm4c Ảnh xấu', imageUrl });
      expect(res.status, imageUrl).toBe(400);
      expect(errOf(res).details).toEqual([expect.objectContaining({ field: 'imageUrl' })]);
    }
    const cat = dataOf(await mkCat({ name: 'tm4c Ảnh sửa' }));
    const res = await call('patch', `/admin/categories/${cat.id}`, staff.who, {
      imageUrl: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
    const ok = await call('patch', `/admin/categories/${cat.id}`, staff.who, {
      imageUrl: 'https://cdn.example.com/a.png',
    });
    expect(ok.status).toBe(200);
    const cleared = await call('patch', `/admin/categories/${cat.id}`, staff.who, {
      imageUrl: null,
    });
    expect(dataOf(cleared).imageUrl).toBeNull();
  });

  it('PATCH: >= 1 trường, đổi tên/slug, audit chỉ ghi trường đổi', async () => {
    const cat = dataOf(await mkCat({ name: 'tm4c Sửa', slug: 'tm4c-sua' }));
    const url = `/admin/categories/${cat.id}`;
    const empty = await call('patch', url, staff.who, {});
    expect(empty.status).toBe(400);
    const res = await call('patch', url, staff.who, {
      name: 'tm4c Sửa xong',
      slug: 'tm4c-sua-xong',
      isActive: false,
    });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({
      name: 'tm4c Sửa xong',
      slug: 'tm4c-sua-xong',
      isActive: false,
    });
    const audits = await auditOf('category.update', cat.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.diff).toEqual({
      name: ['tm4c Sửa', 'tm4c Sửa xong'],
      slug: ['tm4c-sua', 'tm4c-sua-xong'],
      isActive: [true, false],
    });
    // Sửa không đổi gì thì không ghi audit mới
    await call('patch', url, staff.who, { name: 'tm4c Sửa xong' });
    expect(await auditOf('category.update', cat.id)).toHaveLength(1);
    // slug trùng
    const other = await mkCat({ name: 'tm4c Khác', slug: 'tm4c-khac' });
    const dup = await call('patch', `/admin/categories/${dataOf(other).id}`, staff.who, {
      slug: 'tm4c-sua-xong',
    });
    expect(dup.status).toBe(409);
    expect(errOf(dup)).toMatchObject({ code: 'SLUG_TAKEN', details: { field: 'slug' } });
  });

  it('PATCH 404 cho id không tồn tại hoặc sai định dạng', async () => {
    expect(
      (
        await call('patch', '/admin/categories/clxnotexist000000000', staff.who, {
          name: 'tm4c zz',
        })
      ).status,
    ).toBe(404);
    expect(
      (await call('patch', '/admin/categories/BAD-ID', staff.who, { name: 'tm4c zz' })).status,
    ).toBe(404);
  });

  it('PATCH parentId: tự làm cha 400, có con không gán cha 400, null thành gốc', async () => {
    const root = dataOf(await mkCat({ name: 'tm4c Cha P' }));
    const other = dataOf(await mkCat({ name: 'tm4c Cha Q' }));
    const child = dataOf(await mkCat({ name: 'tm4c Con P', parentId: root.id }));

    const self = await call('patch', `/admin/categories/${root.id}`, staff.who, {
      parentId: root.id,
    });
    expect(self.status).toBe(400);
    expect(errOf(self).details).toEqual([expect.objectContaining({ field: 'parentId' })]);

    const hasChildren = await call('patch', `/admin/categories/${root.id}`, staff.who, {
      parentId: other.id,
    });
    expect(hasChildren.status).toBe(400);
    expect(errOf(hasChildren).details).toEqual([expect.objectContaining({ field: 'parentId' })]);

    const underChild = await call('patch', `/admin/categories/${other.id}`, staff.who, {
      parentId: child.id,
    });
    expect(underChild.status).toBe(400);

    const move = await call('patch', `/admin/categories/${child.id}`, staff.who, {
      parentId: other.id,
    });
    expect(move.status).toBe(200);
    expect(dataOf(move).parentId).toBe(other.id);

    const toRoot = await call('patch', `/admin/categories/${child.id}`, staff.who, {
      parentId: null,
    });
    expect(toRoot.status).toBe(200);
    expect(dataOf(toRoot).parentId).toBeNull();
    // cha cũ giờ không còn con -> có thể gán cha
    const nowChild = await call('patch', `/admin/categories/${root.id}`, staff.who, {
      parentId: other.id,
    });
    expect(nowChild.status).toBe(200);
  });

  it('GET: cây 2 cấp gồm inactive, productCount chỉ đếm sản phẩm chưa xóa mềm của chính nó', async () => {
    const root = dataOf(await mkCat({ name: 'tm4c Cây', sortOrder: 9000 }));
    const inactive = dataOf(
      await mkCat({ name: 'tm4c Cây con B', parentId: root.id, isActive: false, sortOrder: 2 }),
    );
    const active = dataOf(await mkCat({ name: 'tm4c Cây con A', parentId: root.id, sortOrder: 1 }));
    await prisma.product.createMany({
      data: [
        { categoryId: active.id, name: 'P1', slug: `${PREFIX}tree-1`, status: 'ACTIVE' },
        { categoryId: active.id, name: 'P2', slug: `${PREFIX}tree-2`, status: 'DRAFT' },
        {
          categoryId: active.id,
          name: 'P3',
          slug: `${PREFIX}tree-3`,
          status: 'ACTIVE',
          deletedAt: new Date(),
        },
        { categoryId: root.id, name: 'P4', slug: `${PREFIX}tree-4`, status: 'ARCHIVED' },
      ],
    });
    const res = await call('get', '/admin/categories', staff.who);
    expect(res.status).toBe(200);
    const node = (res.body.data as Json[]).find((c) => c.id === root.id);
    expect(node).toBeDefined();
    expect(node.productCount).toBe(1);
    expect(node.children.map((c: Json) => c.id)).toEqual([active.id, inactive.id]);
    expect(node.children[0]).toMatchObject({ productCount: 2, children: [], isActive: true });
    expect(node.children[1]).toMatchObject({ isActive: false, productCount: 0 });
    // Con không xuất hiện ở cấp gốc
    expect((res.body.data as Json[]).some((c) => c.id === active.id)).toBe(false);
  });

  it('DELETE bị chặn khi còn con hoặc còn sản phẩm (kể cả đã xóa mềm)', async () => {
    const root = dataOf(await mkCat({ name: 'tm4c Xóa cha' }));
    const child = dataOf(await mkCat({ name: 'tm4c Xóa con', parentId: root.id }));
    const blocked = await call('delete', `/admin/categories/${root.id}`, admin.who);
    expect(blocked.status).toBe(409);
    expect(errOf(blocked)).toMatchObject({
      code: 'CONFLICT',
      details: { childCount: 1, productCount: 0 },
    });

    await prisma.product.create({
      data: {
        categoryId: child.id,
        name: 'Đã xóa',
        slug: `${PREFIX}del-soft`,
        deletedAt: new Date(),
      },
    });
    const blocked2 = await call('delete', `/admin/categories/${child.id}`, admin.who);
    expect(blocked2.status).toBe(409);
    expect(errOf(blocked2).details).toEqual({ childCount: 0, productCount: 1 });

    await prisma.product.deleteMany({ where: { slug: `${PREFIX}del-soft` } });
    expect((await call('delete', `/admin/categories/${child.id}`, admin.who)).status).toBe(204);
    expect((await call('delete', `/admin/categories/${root.id}`, admin.who)).status).toBe(204);
    expect((await call('delete', `/admin/categories/${root.id}`, admin.who)).status).toBe(404);
    const [a] = await auditOf('category.delete', root.id);
    expect(a).toMatchObject({ actorId: admin.id, entity: 'Category' });
    expect(a!.diff).toMatchObject({ name: ['tm4c Xóa cha', null] });
  });
});

describe('thương hiệu', () => {
  it('tạo có/không slug, logoUrl, audit; slug trùng 409; logoUrl xấu 400', async () => {
    const res = await mkBrand({ name: 'tm4c Hiệu Đẹp', logoUrl: '/uploads/logo.png' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const d = dataOf(res);
    expect(d).toMatchObject({
      name: 'tm4c Hiệu Đẹp',
      slug: 'tm4c-hieu-dep',
      logoUrl: '/uploads/logo.png',
      productCount: 0,
    });
    expect(typeof d.createdAt).toBe('string');
    expect(typeof d.updatedAt).toBe('string');
    const [a] = await auditOf('brand.create', d.id);
    expect(a).toMatchObject({ actorId: staff.id, entity: 'Brand' });
    expect(a!.diff).toMatchObject({ slug: [null, 'tm4c-hieu-dep'] });

    expect((await mkBrand({ name: 'tm4c Hiệu Custom', slug: 'tm4c-hc' })).status).toBe(201);
    const dup = await mkBrand({ name: 'tm4c Khác', slug: 'tm4c-hc' });
    expect(dup.status).toBe(409);
    expect(errOf(dup)).toMatchObject({ code: 'SLUG_TAKEN', details: { field: 'slug' } });
    for (const logoUrl of ['javascript:alert(1)', 'http://x.com/a.png', '/uploads/../x']) {
      expect((await mkBrand({ name: 'tm4c Logo xấu', logoUrl })).status, logoUrl).toBe(400);
    }
    expect((await mkBrand({ name: '!!' })).status).toBe(400);
  });

  it('PATCH: >= 1 trường, slug trùng 409, 404, audit', async () => {
    const b = dataOf(await mkBrand({ name: 'tm4c Sửa hiệu', slug: 'tm4c-sua-hieu' }));
    const url = `/admin/brands/${b.id}`;
    expect((await call('patch', url, staff.who, {})).status).toBe(400);
    const res = await call('patch', url, staff.who, { name: 'tm4c Sửa hiệu 2', logoUrl: null });
    expect(res.status).toBe(200);
    expect(dataOf(res).name).toBe('tm4c Sửa hiệu 2');
    const [a] = await auditOf('brand.update', b.id);
    expect(a!.diff).toEqual({ name: ['tm4c Sửa hiệu', 'tm4c Sửa hiệu 2'] });
    const other = dataOf(await mkBrand({ name: 'tm4c Hiệu khác', slug: 'tm4c-hieu-khac' }));
    const dup = await call('patch', `/admin/brands/${other.id}`, staff.who, {
      slug: 'tm4c-sua-hieu',
    });
    expect(dup.status).toBe(409);
    expect(errOf(dup).code).toBe('SLUG_TAKEN');
    expect(
      (await call('patch', '/admin/brands/clxnotexist000000000', staff.who, { name: 'tm4c zz' }))
        .status,
    ).toBe(404);
  });

  it('GET: sắp theo tên, productCount chỉ đếm sản phẩm chưa xóa mềm', async () => {
    const b2 = dataOf(await mkBrand({ name: 'tm4c Zeta' }));
    const b1 = dataOf(await mkBrand({ name: 'tm4c Alpha' }));
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: `${PREFIX}cat` } });
    await prisma.product.createMany({
      data: [
        { categoryId: cat.id, brandId: b1.id, name: 'B1', slug: `${PREFIX}bp-1` },
        {
          categoryId: cat.id,
          brandId: b1.id,
          name: 'B2',
          slug: `${PREFIX}bp-2`,
          deletedAt: new Date(),
        },
      ],
    });
    const res = await call('get', '/admin/brands', staff.who);
    expect(res.status).toBe(200);
    const list = res.body.data as Json[];
    const names = list.map((b) => b.name as string);
    expect(names.indexOf('tm4c Alpha')).toBeLessThan(names.indexOf('tm4c Zeta'));
    expect(list.find((b) => b.id === b1.id).productCount).toBe(1);
    expect(list.find((b) => b.id === b2.id).productCount).toBe(0);
  });

  it('DELETE bị chặn khi còn sản phẩm chưa xóa mềm; sản phẩm xóa mềm thì được và brandId về null', async () => {
    const b = dataOf(await mkBrand({ name: 'tm4c Xóa hiệu' }));
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: `${PREFIX}cat` } });
    const live = await prisma.product.create({
      data: { categoryId: cat.id, brandId: b.id, name: 'Live', slug: `${PREFIX}bdel-live` },
    });
    const soft = await prisma.product.create({
      data: {
        categoryId: cat.id,
        brandId: b.id,
        name: 'Soft',
        slug: `${PREFIX}bdel-soft`,
        deletedAt: new Date(),
      },
    });
    const blocked = await call('delete', `/admin/brands/${b.id}`, admin.who);
    expect(blocked.status).toBe(409);
    expect(errOf(blocked)).toMatchObject({ code: 'CONFLICT', details: { productCount: 1 } });

    await prisma.product.update({ where: { id: live.id }, data: { deletedAt: new Date() } });
    expect((await call('delete', `/admin/brands/${b.id}`, admin.who)).status).toBe(204);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: soft.id } })).brandId).toBeNull();
    expect((await call('delete', `/admin/brands/${b.id}`, admin.who)).status).toBe(404);
    const [a] = await auditOf('brand.delete', b.id);
    expect(a).toMatchObject({ actorId: admin.id, entity: 'Brand' });
  });
});
