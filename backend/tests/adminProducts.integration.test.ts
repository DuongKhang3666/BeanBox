import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm4p-';
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

let app: Express;
let uploadsDir: string;
let categoryId: string;
const fx = createFixtures(() => app, PREFIX);

let staff: { id: string; who: Who };
let admin: { id: string; who: Who };
let customer: { id: string; who: Who };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const post = (p: string, body: Record<string, unknown>, who: Who = staff.who) =>
  fx.call('post', p, who, body);
const patch = (p: string, body: Record<string, unknown>, who: Who = staff.who) =>
  fx.call('patch', p, who, body);
const get = (p: string, who: Who = staff.who) => fx.call('get', p, who);
const del = (p: string, who: Who = staff.who) => fx.call('delete', p, who);
const put = (p: string, body: Record<string, unknown>, who: Who = staff.who) =>
  request(app)
    .put(`${API}${p}`)
    .set('Origin', ORIGIN)
    .set(who.auth ?? {})
    .send(body);

const upload = (buf: Buffer, contentType: string, who: Who = staff.who, target: Express = app) =>
  request(target)
    .post(`${API}/admin/uploads`)
    .set('Origin', ORIGIN)
    .set(who.auth ?? {})
    .set('Content-Type', contentType)
    .send(buf);

let seq = 0;
async function mkProduct(over: Record<string, unknown> = {}): Promise<Json> {
  const n = ++seq;
  const res = await post('/admin/products', { name: `TM4P Prod${n}`, categoryId, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return dataOf(res);
}

async function addVariant(productId: string, over: Record<string, unknown> = {}): Promise<Json> {
  const res = await post(`/admin/products/${productId}/variants`, {
    sku: `TM4P-V${++seq}`,
    name: 'Biến thể',
    price: 100000,
    ...over,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return dataOf(res);
}

/** Sản phẩm ACTIVE với `count` biến thể đang bán. */
async function mkActiveProduct(count = 1): Promise<{ product: Json; variants: Json[] }> {
  const product = await mkProduct();
  const variants: Json[] = [];
  for (let i = 0; i < count; i++) variants.push(await addVariant(product.id, { stock: 10 }));
  const res = await patch(`/admin/products/${product.id}`, { status: 'ACTIVE' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { product: dataOf(res), variants };
}

const dbProduct = (id: string) => prisma.product.findUniqueOrThrow({ where: { id } });
const imgUrl = (n: number) => `/uploads/tm4p/img${n}.jpg`;

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
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
}

beforeAll(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'bb-uploads-'));
  app = createApp({ ...BIG, uploadsDir });
  await cleanAudit();
  await fx.setup();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: `${PREFIX}cat` } })).id;
  staff = await mkRole('staff', 'STAFF');
  admin = await mkRole('admin', 'ADMIN');
  customer = await mkRole('cust', 'CUSTOMER');
});

afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await rm(uploadsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('phân quyền sản phẩm / biến thể / ảnh / upload', () => {
  const endpoints: Array<['get' | 'post' | 'patch' | 'delete', string, Record<string, unknown>?]> =
    [
      ['get', '/admin/products'],
      ['get', '/admin/products/abc'],
      ['post', '/admin/products', {}],
      ['patch', '/admin/products/abc', { name: 'Tên mới' }],
      ['delete', '/admin/products/abc'],
      ['post', '/admin/products/abc/variants', {}],
      ['patch', '/admin/variants/abc', { name: 'x' }],
      ['delete', '/admin/variants/abc'],
      ['post', '/admin/products/abc/images', {}],
      ['patch', '/admin/products/abc/images/def', { alt: 'x' }],
      ['delete', '/admin/products/abc/images/def'],
      ['post', '/admin/uploads', {}],
    ];

  it('401 không token; 403 CUSTOMER', async () => {
    for (const [m, p, body] of endpoints) {
      const anon = await fx.call(m, p, {}, body);
      expect(anon.status, `${m} ${p}`).toBe(401);
      expect(errOf(anon).code).toBe('UNAUTHORIZED');
      const c = await fx.call(m, p, customer.who, body);
      expect(c.status, `${m} ${p}`).toBe(403);
      expect(errOf(c).code).toBe('FORBIDDEN');
    }
    const putRes = await put('/admin/products/abc/images/order', { imageIds: [] }, customer.who);
    expect(putRes.status).toBe(403);
  });

  it('STAFF làm được từng nhóm; DELETE sản phẩm: STAFF 403, ADMIN 204', async () => {
    expect((await get('/admin/products?pageSize=1', staff.who)).status).toBe(200);
    const product = await mkProduct(); // STAFF tạo
    const v = await addVariant(product.id);
    expect((await patch(`/admin/variants/${v.id}`, { name: 'Đổi tên' }, staff.who)).status).toBe(
      200,
    );
    const imgRes = await post(
      `/admin/products/${product.id}/images`,
      { url: imgUrl(1) },
      staff.who,
    );
    expect(imgRes.status).toBe(201);
    expect((await put(`/admin/products/${product.id}/images/order`, { imageIds: [] })).status).toBe(
      400,
    );

    const forbidden = await del(`/admin/products/${product.id}`, staff.who);
    expect(forbidden.status).toBe(403);
    expect(errOf(forbidden).code).toBe('FORBIDDEN');
    expect((await dbProduct(product.id)).deletedAt).toBeNull();

    expect((await del(`/admin/products/${product.id}`, admin.who)).status).toBe(204);
    expect((await get('/admin/products?pageSize=1', admin.who)).status).toBe(200);
  });
});

describe('sản phẩm', () => {
  it('tạo DRAFT: mặc định, slug sinh từ tên có dấu, tags chuẩn hóa', async () => {
    const res = await post('/admin/products', {
      name: 'TM4P Cà phê Đà Lạt Cầu Đất',
      categoryId,
      tags: [' Arabica ', 'ARABICA', 'đặc sản'],
      shortDesc: 'Hương hoa quả',
    });
    expect(res.status).toBe(201);
    const p = dataOf(res);
    expect(p).toMatchObject({
      slug: 'tm4p-ca-phe-da-lat-cau-dat',
      status: 'DRAFT',
      isFeatured: false,
      tags: ['arabica', 'đặc sản'],
      brandId: null,
      coffee: null,
      images: [],
      variants: [],
      minPrice: 0,
      inStock: false,
      soldCount: 0,
      deletedAt: null,
    });
    const db = await dbProduct(p.id);
    expect(db.searchText).toContain('tm4p ca phe da lat cau dat');
    expect(db.searchText).toContain('huong hoa qua');
  });

  it('tạo ACTIVE khi chưa có biến thể -> 400 field status', async () => {
    const res = await post('/admin/products', {
      name: 'TM4P Active Ngay',
      categoryId,
      status: 'ACTIVE',
    });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    expect((errOf(res).details as Json)[0].field).toBe('status');
    expect(await prisma.product.count({ where: { slug: 'tm4p-active-ngay' } })).toBe(0);
  });

  it('thêm biến thể rồi PATCH ACTIVE thì được; biến thể bị tắt không tính', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { isActive: false });
    const fail = await patch(`/admin/products/${p.id}`, { status: 'ACTIVE' });
    expect(fail.status).toBe(400);
    expect((errOf(fail).details as Json)[0].field).toBe('status');

    await patch(`/admin/variants/${v.id}`, { isActive: true });
    const ok = await patch(`/admin/products/${p.id}`, { status: 'ACTIVE' });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).status).toBe('ACTIVE');
  });

  it('SLUG_TAKEN khi tạo và khi đổi slug; cho phép đổi slug hợp lệ', async () => {
    const a = await mkProduct({ name: 'TM4P Slug Trung' });
    const dup = await post('/admin/products', { name: 'TM4P Slug Trung', categoryId });
    expect(dup.status).toBe(409);
    expect(errOf(dup).code).toBe('SLUG_TAKEN');
    expect(errOf(dup).details).toEqual({ field: 'slug' });

    const b = await mkProduct();
    const clash = await patch(`/admin/products/${b.id}`, { slug: a.slug });
    expect(clash.status).toBe(409);
    expect(errOf(clash).code).toBe('SLUG_TAKEN');

    const ok = await patch(`/admin/products/${b.id}`, { slug: 'tm4p-slug-moi' });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).slug).toBe('tm4p-slug-moi');

    const bad = await patch(`/admin/products/${b.id}`, { slug: 'Slug Sai!' });
    expect(bad.status).toBe(400);
  });

  it('categoryId / brandId không tồn tại -> 400 đúng field', async () => {
    const badCat = await post('/admin/products', {
      name: 'TM4P Danh Muc La',
      categoryId: 'clxxxxxxxxxxxxxxxxxxxxxxx',
    });
    expect(badCat.status).toBe(400);
    expect((errOf(badCat).details as Json)[0].field).toBe('categoryId');

    const badBrand = await post('/admin/products', {
      name: 'TM4P Brand La',
      categoryId,
      brandId: 'clxxxxxxxxxxxxxxxxxxxxxxx',
    });
    expect(badBrand.status).toBe(400);
    expect((errOf(badBrand).details as Json)[0].field).toBe('brandId');

    const p = await mkProduct();
    const patchBad = await patch(`/admin/products/${p.id}`, {
      categoryId: 'clyyyyyyyyyyyyyyyyyyyyyyy',
    });
    expect(patchBad.status).toBe(400);
    expect((errOf(patchBad).details as Json)[0].field).toBe('categoryId');
  });

  it('PATCH cần >= 1 trường; validate độ dài và tags', async () => {
    const p = await mkProduct();
    expect((await patch(`/admin/products/${p.id}`, {})).status).toBe(400);
    expect((await patch(`/admin/products/${p.id}`, { name: 'x' })).status).toBe(400);
    const tags = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect((await patch(`/admin/products/${p.id}`, { tags })).status).toBe(400);
    expect((await patch(`/admin/products/${p.id}`, { shortDesc: 'a'.repeat(301) })).status).toBe(
      400,
    );
  });

  it('coffee: tạo, sửa từng phần, xóa bằng null', async () => {
    const p = await mkProduct({
      coffee: {
        originCountry: 'Ethiopia',
        roastLevel: 'LIGHT',
        process: 'WASHED',
        altitude: 1900,
        tastingNotes: ['Hoa nhài', 'Cam'],
        brewMethods: ['POUR_OVER', 'POUR_OVER', 'AEROPRESS'],
      },
    });
    expect(p.coffee).toMatchObject({
      originCountry: 'Ethiopia',
      originRegion: null,
      roastLevel: 'LIGHT',
      process: 'WASHED',
      altitude: 1900,
      tastingNotes: ['Hoa nhài', 'Cam'],
      brewMethods: ['POUR_OVER', 'AEROPRESS'],
    });

    const upd = await patch(`/admin/products/${p.id}`, { coffee: { roastLevel: 'DARK' } });
    expect(dataOf(upd).coffee).toMatchObject({
      originCountry: 'Ethiopia',
      roastLevel: 'DARK',
      tastingNotes: ['Hoa nhài', 'Cam'],
    });

    const bad = await patch(`/admin/products/${p.id}`, { coffee: { altitude: 5000 } });
    expect(bad.status).toBe(400);

    const rm1 = await patch(`/admin/products/${p.id}`, { coffee: null });
    expect(rm1.status).toBe(200);
    expect(dataOf(rm1).coffee).toBeNull();
    expect(await prisma.coffeeProfile.count({ where: { productId: p.id } })).toBe(0);

    const none = await mkProduct();
    const created = await patch(`/admin/products/${none.id}`, { coffee: { variety: 'Arabica' } });
    expect(dataOf(created).coffee).toMatchObject({ variety: 'Arabica', tastingNotes: [] });
  });

  it('denormalize minPrice / inStock / searchText đúng sau tạo, sửa giá, xóa biến thể', async () => {
    const p = await mkProduct({ name: 'TM4P Denorm Ban Dau' });
    expect(await dbProduct(p.id)).toMatchObject({ minPrice: 0, inStock: false });

    const v1 = await addVariant(p.id, { price: 200000, salePrice: 150000, stock: 5 });
    expect(await dbProduct(p.id)).toMatchObject({ minPrice: 150000, inStock: true });

    await patch(`/admin/variants/${v1.id}`, { salePrice: null, price: 180000 });
    expect((await dbProduct(p.id)).minPrice).toBe(180000);

    const v2 = await addVariant(p.id, { price: 90000, stock: 0 });
    expect(await dbProduct(p.id)).toMatchObject({ minPrice: 90000, inStock: true });

    expect((await del(`/admin/variants/${v2.id}`)).status).toBe(204);
    expect(await dbProduct(p.id)).toMatchObject({ minPrice: 180000, inStock: true });

    expect((await del(`/admin/variants/${v1.id}`)).status).toBe(204);
    expect(await dbProduct(p.id)).toMatchObject({ minPrice: 0, inStock: false });

    await patch(`/admin/products/${p.id}`, { name: 'TM4P Đổi Tên Mới', tags: ['Mới'] });
    const db = await dbProduct(p.id);
    expect(db.searchText).toContain('doi ten moi');
    expect(db.searchText).toContain('moi');
    expect(db.searchText).not.toContain('ban dau');
  });

  it('xóa mềm: biến mất khỏi storefront, PATCH/DELETE lại 404, GET admin vẫn xem được', async () => {
    const { product } = await mkActiveProduct(1);
    await patch(`/admin/products/${product.id}`, { name: 'TM4P Gonexyz' });
    const slug = product.slug as string;

    const list1 = await request(app).get(`${API}/products?q=gonexyz&pageSize=100`);
    expect((list1.body as Json).data.map((x: Json) => x.id)).toContain(product.id);
    expect((await request(app).get(`${API}/products/${slug}`)).status).toBe(200);

    expect((await del(`/admin/products/${product.id}`, admin.who)).status).toBe(204);

    const list2 = await request(app).get(`${API}/products?q=gonexyz&pageSize=100`);
    expect((list2.body as Json).data.map((x: Json) => x.id)).not.toContain(product.id);
    expect((await request(app).get(`${API}/products/${slug}`)).status).toBe(404);

    const db = await dbProduct(product.id);
    expect(db.status).toBe('ARCHIVED');
    expect(db.deletedAt).not.toBeNull();
    expect(db.slug).toBe(slug); // slug vẫn bị giữ

    const patched = await patch(`/admin/products/${product.id}`, { name: 'Sau khi xóa' });
    expect(patched.status).toBe(404);
    expect((await del(`/admin/products/${product.id}`, admin.who)).status).toBe(404);
    expect(
      (
        await post(`/admin/products/${product.id}/variants`, {
          sku: 'TM4P-DEL1',
          name: 'x',
          price: 1000,
        })
      ).status,
    ).toBe(404);

    const detail = await get(`/admin/products/${product.id}`);
    expect(detail.status).toBe(200);
    expect(dataOf(detail).deletedAt).not.toBeNull();
    expect(dataOf(detail).status).toBe('ARCHIVED');

    const dup = await post('/admin/products', { name: 'TM4P Khac', categoryId, slug });
    expect(dup.status).toBe(409);
  });

  it('ID sai định dạng hoặc không tồn tại -> 404', async () => {
    expect((await get('/admin/products/NOT_VALID!')).status).toBe(404);
    expect((await get('/admin/products/clxxxxxxxxxxxxxxxxxxxxxxx')).status).toBe(404);
    expect((await patch('/admin/products/clxxxxxxxxxxxxxxxxxxxxxxx', { name: 'Abc' })).status).toBe(
      404,
    );
  });

  it('GET chi tiết: đủ trường, biến thể có effectivePrice / isOnSale / stockStatus', async () => {
    const p = await mkProduct({ name: 'TM4P Chi Tiet' });
    const out = await addVariant(p.id, { stock: 0, name: 'Hết', sortOrder: 1 });
    const low = await addVariant(p.id, { stock: 5, name: 'Sắp hết', sortOrder: 2 });
    const inStock = await addVariant(p.id, {
      stock: 6,
      name: 'Còn',
      sortOrder: 3,
      price: 200000,
      salePrice: 150000,
      attributes: { weight: '250g' },
    });
    const future = await addVariant(p.id, {
      sortOrder: 4,
      price: 100000,
      salePrice: 70000,
      saleStart: '2099-01-01T00:00:00.000Z',
      saleEnd: '2099-02-01T00:00:00.000Z',
      roastDate: '2026-11-01',
    });
    const gone = await addVariant(p.id, { sortOrder: 5 });
    await del(`/admin/variants/${gone.id}`);

    const res = await get(`/admin/products/${p.id}`);
    const d = dataOf(res);
    expect(Object.keys(d).sort()).toEqual(
      [
        'id',
        'slug',
        'name',
        'shortDesc',
        'description',
        'status',
        'isFeatured',
        'tags',
        'seoTitle',
        'seoDesc',
        'categoryId',
        'brandId',
        'coffee',
        'images',
        'variants',
        'minPrice',
        'inStock',
        'soldCount',
        'ratingAvg',
        'ratingCount',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(d.variants.map((v: Json) => v.id)).toEqual([out.id, low.id, inStock.id, future.id]);
    const [vOut, vLow, vIn, vFuture] = d.variants as Json[];
    expect(vOut).toMatchObject({ stockStatus: 'OUT_OF_STOCK', stock: 0, isOnSale: false });
    expect(vLow).toMatchObject({ stockStatus: 'LOW_STOCK', stock: 5, lowStockThreshold: 5 });
    expect(vIn).toMatchObject({
      stockStatus: 'IN_STOCK',
      price: 200000,
      salePrice: 150000,
      effectivePrice: 150000,
      isOnSale: true,
      attributes: { weight: '250g' },
    });
    expect(vFuture).toMatchObject({
      salePrice: 70000,
      effectivePrice: 100000,
      isOnSale: false,
      saleStart: '2099-01-01T00:00:00.000Z',
      roastDate: '2026-11-01',
    });
    expect(Object.keys(vIn).sort()).toEqual(
      [
        'id',
        'sku',
        'name',
        'attributes',
        'price',
        'salePrice',
        'saleStart',
        'saleEnd',
        'effectivePrice',
        'isOnSale',
        'stock',
        'lowStockThreshold',
        'stockStatus',
        'weightGram',
        'roastDate',
        'sortOrder',
        'isActive',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('danh sách: item đúng contract, variantCount/totalStock bỏ biến thể đã xóa, bộ lọc, phân trang', async () => {
    const brand = await prisma.brand.create({
      data: { name: 'TM4P Brand', slug: `${PREFIX}brand-list` },
    });
    const a = await mkProduct({ name: 'TM4P Lst Alpha', brandId: brand.id });
    const b = await mkProduct({ name: 'TM4P Lst Beta' });
    const c = await mkProduct({ name: 'TM4P Lst Gamma', status: 'ARCHIVED' });
    await addVariant(a.id, { stock: 4, price: 120000 });
    const va2 = await addVariant(a.id, { stock: 6, price: 90000 });
    const va3 = await addVariant(a.id, { stock: 100 });
    await del(`/admin/variants/${va3.id}`);
    expect(va2.id).toBeTruthy();
    await post(`/admin/products/${a.id}/images`, { url: imgUrl(1) });

    const q = `categoryId=${categoryId}&pageSize=100`;
    const res = await get(`/admin/products?${q}&q=Lst`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100, total: 3, totalPages: 1 });
    const item = (res.body.data as Json[]).find((x) => x.id === a.id);
    expect(item).toEqual({
      id: a.id,
      slug: 'tm4p-lst-alpha',
      name: 'TM4P Lst Alpha',
      status: 'DRAFT',
      isFeatured: false,
      category: { id: categoryId, name: `Danh mục ${PREFIX}` },
      brand: { id: brand.id, name: 'TM4P Brand' },
      primaryImageUrl: imgUrl(1),
      minPrice: 90000,
      variantCount: 2,
      totalStock: 10,
      inStock: true,
      deletedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const itemB = (res.body.data as Json[]).find((x) => x.id === b.id);
    expect(itemB).toMatchObject({
      brand: null,
      primaryImageUrl: null,
      variantCount: 0,
      totalStock: 0,
    });

    const ids = async (query: string) =>
      ((await get(`/admin/products?${q}&q=Lst&${query}`)).body.data as Json[]).map((x) => x.id);
    expect((await ids('status=ARCHIVED')).sort()).toEqual([c.id]);
    expect((await ids('status=DRAFT,ARCHIVED')).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(await ids(`brandId=${brand.id}`)).toEqual([a.id]);
    expect(await ids('sort=name')).toEqual([a.id, b.id, c.id]);
    expect(await ids('sort=newest')).toEqual([c.id, b.id, a.id]);

    const page2 = await get(
      `/admin/products?categoryId=${categoryId}&q=Lst&sort=name&pageSize=2&page=2`,
    );
    expect(page2.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect((page2.body.data as Json[]).map((x) => x.id)).toEqual([c.id]);

    expect((await get('/admin/products?status=BAD')).status).toBe(400);
    expect((await get('/admin/products?deleted=maybe')).status).toBe(400);
    expect((await get('/admin/products?sort=zzz')).status).toBe(400);
    expect((await get('/admin/products?pageSize=101')).status).toBe(400);

    // q không dấu, khớp cả slug
    const alpha = await get(`/admin/products?${q}&q=lst%20alpha`);
    expect((alpha.body.data as Json[]).map((x) => x.id)).toEqual([a.id]);
    const accent = await mkProduct({ name: 'TM4P Lst Đắk Lắk' });
    const byUnaccented = await get(`/admin/products?${q}&q=dak%20lak`);
    expect((byUnaccented.body.data as Json[]).map((x) => x.id)).toEqual([accent.id]);
    const bySlug = await get(`/admin/products?${q}&q=tm4p-lst-dak`);
    expect((bySlug.body.data as Json[]).map((x) => x.id)).toEqual([accent.id]);
  });

  it('lọc deleted=true chỉ trả sản phẩm đã xóa mềm', async () => {
    const live = await mkProduct({ name: 'TM4P Del Live' });
    const dead = await mkProduct({ name: 'TM4P Del Dead' });
    await del(`/admin/products/${dead.id}`, admin.who);

    const onlyDeleted = await get(`/admin/products?categoryId=${categoryId}&q=Del&deleted=true`);
    expect((onlyDeleted.body.data as Json[]).map((x) => x.id)).toEqual([dead.id]);
    expect((onlyDeleted.body.data as Json[])[0].deletedAt).toEqual(expect.any(String));

    const notDeleted = await get(`/admin/products?categoryId=${categoryId}&q=Del`);
    expect((notDeleted.body.data as Json[]).map((x) => x.id)).toEqual([live.id]);
  });

  it('q chứa % và _ chỉ là ký tự thường', async () => {
    const pct = await mkProduct({ name: 'TM4P Giam 100% Arabica' });
    const und = await mkProduct({ name: 'TM4P Ten a_b' });
    const plain = await mkProduct({ name: 'TM4P Plain Robusta' });
    const find = async (term: string) =>
      (
        (
          await get(
            `/admin/products?categoryId=${categoryId}&pageSize=100&q=${encodeURIComponent(term)}`,
          )
        ).body.data as Json[]
      ).map((x) => x.id);

    expect(await find('%')).toEqual([pct.id]);
    expect(await find('100%')).toEqual([pct.id]);
    expect(await find('_')).toEqual([und.id]);
    expect(await find('a_b')).toEqual([und.id]);
    expect(await find('a_c')).toEqual([]);
    expect(await find('\\')).toEqual([]);
    expect(plain.id).toBeTruthy();
  });

  it('AuditLog: product.create/update/delete, diff chỉ trường đổi, không ghi toàn văn mô tả', async () => {
    const created = await mkProduct({ name: 'TM4P Audit San Pham', description: 'x'.repeat(50) });
    const longText = 'Mô tả rất dài '.repeat(100);
    await patch(`/admin/products/${created.id}`, {
      description: longText,
      name: 'TM4P Audit Doi Ten',
      isFeatured: true,
    });
    // PATCH không đổi gì -> không thêm dòng audit
    await patch(`/admin/products/${created.id}`, { isFeatured: true });
    await del(`/admin/products/${created.id}`, admin.who);

    const logs = await prisma.auditLog.findMany({
      where: { entity: 'Product', entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'product.create',
      'product.update',
      'product.delete',
    ]);
    for (const l of logs) {
      expect(l.actorId).toBe(l.action === 'product.delete' ? admin.id : staff.id);
      expect(l.ip).toBeTruthy();
    }
    const [c, u, d] = logs.map((l) => l.diff as Json);
    expect(c.name).toEqual([null, 'TM4P Audit San Pham']);
    expect(c.status).toEqual([null, 'DRAFT']);
    expect(c.description).toEqual([null, '(50 ký tự)']);
    expect(Object.keys(u).sort()).toEqual(['description', 'isFeatured', 'name']);
    expect(u.description).toEqual(['(đã sửa)', '(đã sửa)']);
    expect(u.name).toEqual(['TM4P Audit San Pham', 'TM4P Audit Doi Ten']);
    expect(u.isFeatured).toEqual([false, true]);
    expect(JSON.stringify(logs.map((l) => l.diff))).not.toContain('Mô tả rất dài');
    expect(d.status).toEqual(['DRAFT', 'ARCHIVED']);
    expect(d.deletedAt[0]).toBeNull();
  });
});

describe('biến thể', () => {
  it('tạo: chuẩn hóa SKU, mặc định, validate các trường', async () => {
    const p = await mkProduct();
    const res = await post(`/admin/products/${p.id}/variants`, {
      sku: ' tm4p-lc1 ',
      name: ' 250 g ',
      price: 150000,
    });
    expect(res.status).toBe(201);
    expect(dataOf(res)).toMatchObject({
      sku: 'TM4P-LC1',
      name: '250 g',
      attributes: {},
      salePrice: null,
      saleStart: null,
      saleEnd: null,
      stock: 0,
      lowStockThreshold: 5,
      weightGram: 0,
      roastDate: null,
      sortOrder: 0,
      isActive: true,
      effectivePrice: 150000,
      isOnSale: false,
      stockStatus: 'OUT_OF_STOCK',
    });

    const base = { name: 'V', price: 1000 };
    const bad = async (over: Record<string, unknown>, field: string) => {
      const r = await post(`/admin/products/${p.id}/variants`, {
        sku: 'TM4P-OK1',
        ...base,
        ...over,
      });
      expect(r.status, JSON.stringify(over)).toBe(400);
      expect((errOf(r).details as Json[]).map((d) => d.field)).toContain(field);
    };
    await bad({ sku: '-abc' }, 'sku');
    await bad({ sku: 'a' }, 'sku');
    await bad({ sku: 'AB CD' }, 'sku');
    await bad({ sku: 'A'.repeat(41) }, 'sku');
    await bad({ price: 0 }, 'price');
    await bad({ price: 100_000_001 }, 'price');
    await bad({ price: 10.5 }, 'price');
    await bad({ stock: -1 }, 'stock');
    await bad({ stock: 100_001 }, 'stock');
    await bad({ lowStockThreshold: 1001 }, 'lowStockThreshold');
    await bad({ weightGram: 100_001 }, 'weightGram');
    await bad({ roastDate: '2026-02-31' }, 'roastDate');
    await bad({ roastDate: '01/11/2026' }, 'roastDate');
    await bad({ sortOrder: 10_000 }, 'sortOrder');
    await bad({ name: '' }, 'name');
    await bad({ attributes: { a: 1 } }, 'attributes.a');
    await bad(
      { attributes: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 'v'])) },
      'attributes',
    );
    await bad({ saleStart: 'không phải ngày', salePrice: 500 }, 'saleStart');
  });

  it('SKU_TAKEN kể cả khi biến thể trùng đã xóa mềm', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { sku: 'TM4P-DUP1' });
    const dup = await post(`/admin/products/${p.id}/variants`, {
      sku: 'tm4p-dup1',
      name: 'x',
      price: 1000,
    });
    expect(dup.status).toBe(409);
    expect(errOf(dup).code).toBe('SKU_TAKEN');
    expect(errOf(dup).details).toEqual({ field: 'sku' });

    expect((await del(`/admin/variants/${v.id}`)).status).toBe(204);
    const again = await post(`/admin/products/${p.id}/variants`, {
      sku: 'TM4P-DUP1',
      name: 'x',
      price: 1000,
    });
    expect(again.status).toBe(409);
    expect(errOf(again).code).toBe('SKU_TAKEN');

    const other = await addVariant(p.id, { sku: 'TM4P-DUP2' });
    const clash = await patch(`/admin/variants/${other.id}`, { sku: 'TM4P-DUP1' });
    expect(clash.status).toBe(409);
    expect(errOf(clash).code).toBe('SKU_TAKEN');
  });

  it('salePrice phải > 0 và < price; kiểm theo giá trị SAU cập nhật; sale window', async () => {
    const p = await mkProduct();
    const create = (over: Record<string, unknown>) =>
      post(`/admin/products/${p.id}/variants`, {
        sku: `TM4P-S${++seq}`,
        name: 'x',
        price: 100000,
        ...over,
      });

    for (const salePrice of [100000, 120000, 0, -5]) {
      const r = await create({ salePrice });
      expect(r.status, String(salePrice)).toBe(400);
      expect((errOf(r).details as Json[])[0].field).toBe('salePrice');
    }
    const badWindow = await create({
      salePrice: 50000,
      saleStart: '2030-02-01T00:00:00.000Z',
      saleEnd: '2030-01-01T00:00:00.000Z',
    });
    expect(badWindow.status).toBe(400);
    expect((errOf(badWindow).details as Json[])[0].field).toBe('saleEnd');
    const equalWindow = await create({
      saleStart: '2030-01-01T00:00:00.000Z',
      saleEnd: '2030-01-01T00:00:00.000Z',
    });
    expect(equalWindow.status).toBe(400);

    const v = dataOf(await create({ price: 200000, salePrice: 150000 }));
    // PATCH chỉ price xuống dưới salePrice cũ
    const down = await patch(`/admin/variants/${v.id}`, { price: 140000 });
    expect(down.status).toBe(400);
    expect((errOf(down).details as Json[])[0].field).toBe('salePrice');
    // PATCH chỉ salePrice >= price hiện tại
    expect((await patch(`/admin/variants/${v.id}`, { salePrice: 200000 })).status).toBe(400);
    // PATCH chỉ saleStart sau saleEnd cũ
    await patch(`/admin/variants/${v.id}`, { saleEnd: '2030-01-01T00:00:00.000Z' });
    expect(
      (await patch(`/admin/variants/${v.id}`, { saleStart: '2031-01-01T00:00:00.000Z' })).status,
    ).toBe(400);
    // Giá trị không đổi trong DB
    const db = await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(db).toMatchObject({ price: 200000, salePrice: 150000 });

    // Gỡ salePrice cùng lúc hạ giá thì hợp lệ
    const ok = await patch(`/admin/variants/${v.id}`, { price: 140000, salePrice: null });
    expect(ok.status).toBe(200);
    expect(dataOf(ok)).toMatchObject({ price: 140000, salePrice: null, isOnSale: false });
  });

  it('tồn kho ban đầu > 0 ghi InventoryMovement STOCKTAKE; = 0 thì không', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { stock: 12 });
    const moves = await prisma.inventoryMovement.findMany({ where: { variantId: v.id } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      change: 12,
      stockAfter: 12,
      reason: 'STOCKTAKE',
      note: 'Tồn kho ban đầu',
      actorId: staff.id,
      orderId: null,
    });
    const zero = await addVariant(p.id, { stock: 0 });
    expect(await prisma.inventoryMovement.count({ where: { variantId: zero.id } })).toBe(0);
  });

  it('PATCH bỏ qua stock; chỉ gửi stock thì 400', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { stock: 7 });
    const res = await patch(`/admin/variants/${v.id}`, { name: 'Tên mới', stock: 999 });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ name: 'Tên mới', stock: 7 });
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(7);
    expect(await prisma.inventoryMovement.count({ where: { variantId: v.id } })).toBe(1);
    expect((await patch(`/admin/variants/${v.id}`, { stock: 5 })).status).toBe(400);
  });

  it('PATCH cập nhật các trường; biến thể đã xóa hoặc sản phẩm cha đã xóa -> 404', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { stock: 3 });
    const res = await patch(`/admin/variants/${v.id}`, {
      attributes: { weight: '1kg' },
      weightGram: 1000,
      lowStockThreshold: 2,
      roastDate: '2026-10-15',
      sortOrder: 9,
    });
    expect(dataOf(res)).toMatchObject({
      attributes: { weight: '1kg' },
      weightGram: 1000,
      lowStockThreshold: 2,
      roastDate: '2026-10-15',
      sortOrder: 9,
      stockStatus: 'IN_STOCK',
    });
    expect(
      dataOf(await patch(`/admin/variants/${v.id}`, { roastDate: null })).roastDate,
    ).toBeNull();

    const gone = await addVariant(p.id);
    await del(`/admin/variants/${gone.id}`);
    expect((await patch(`/admin/variants/${gone.id}`, { name: 'x' })).status).toBe(404);
    expect((await del(`/admin/variants/${gone.id}`)).status).toBe(404);
    const deletedRow = await prisma.productVariant.findUniqueOrThrow({ where: { id: gone.id } });
    expect(deletedRow).toMatchObject({ isActive: false });
    expect(deletedRow.deletedAt).not.toBeNull();

    await del(`/admin/products/${p.id}`, admin.who);
    expect((await patch(`/admin/variants/${v.id}`, { name: 'x' })).status).toBe(404);
    expect((await del(`/admin/variants/${v.id}`)).status).toBe(404);
    expect((await patch('/admin/variants/clxxxxxxxxxxxxxxxxxxxxxxx', { name: 'x' })).status).toBe(
      404,
    );
  });

  it('chặn xóa / tắt biến thể active cuối của sản phẩm ACTIVE; DRAFT thì cho', async () => {
    const { product, variants } = await mkActiveProduct(2);
    const [v1, v2] = variants as [Json, Json];

    expect((await del(`/admin/variants/${v1.id}`)).status).toBe(204);

    const delLast = await del(`/admin/variants/${v2.id}`);
    expect(delLast.status).toBe(409);
    expect(errOf(delLast).code).toBe('CONFLICT');
    expect(errOf(delLast).message).toContain('chuyển sản phẩm sang Nháp');
    const offLast = await patch(`/admin/variants/${v2.id}`, { isActive: false });
    expect(offLast.status).toBe(409);
    expect(errOf(offLast).code).toBe('CONFLICT');
    const row = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    expect(row).toMatchObject({ isActive: true, deletedAt: null });

    // Biến thể không bán thêm thì xóa được; biến thể cuối vẫn bị chặn
    const extra = await addVariant(product.id, { isActive: false });
    expect((await del(`/admin/variants/${extra.id}`)).status).toBe(204);
    expect((await patch(`/admin/variants/${v2.id}`, { name: 'Đổi tên vẫn được' })).status).toBe(
      200,
    );

    // Chuyển DRAFT rồi tắt/xóa
    await patch(`/admin/products/${product.id}`, { status: 'DRAFT' });
    expect((await patch(`/admin/variants/${v2.id}`, { isActive: false })).status).toBe(200);
    expect((await del(`/admin/variants/${v2.id}`)).status).toBe(204);
  });

  it('PATCH isActive:false lên biến thể active duy nhất còn lại của ACTIVE -> 409, có biến thể khác thì ok', async () => {
    const { product, variants } = await mkActiveProduct(1);
    const only = variants[0] as Json;
    expect((await patch(`/admin/variants/${only.id}`, { isActive: false })).status).toBe(409);
    const second = await addVariant(product.id);
    expect((await patch(`/admin/variants/${only.id}`, { isActive: false })).status).toBe(200);
    // second giờ là biến thể active cuối
    expect((await patch(`/admin/variants/${second.id}`, { isActive: false })).status).toBe(409);
    // Bật lại biến thể đầu rồi tắt second
    expect((await patch(`/admin/variants/${only.id}`, { isActive: true })).status).toBe(200);
    expect((await patch(`/admin/variants/${second.id}`, { isActive: false })).status).toBe(200);
  });

  it('2 request song song xóa 2 biến thể active cuối của sản phẩm ACTIVE -> đúng 1 thành công', async () => {
    for (let round = 0; round < 3; round++) {
      const { product, variants } = await mkActiveProduct(2);
      const results = await Promise.all(variants.map((v: Json) => del(`/admin/variants/${v.id}`)));
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(
        await prisma.productVariant.count({
          where: { productId: product.id, isActive: true, deletedAt: null },
        }),
      ).toBe(1);
    }
  });

  it('song song: PATCH isActive:false hai biến thể -> đúng 1 thành công', async () => {
    const { product, variants } = await mkActiveProduct(2);
    const results = await Promise.all(
      variants.map((v: Json) => patch(`/admin/variants/${v.id}`, { isActive: false })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.productVariant.count({
        where: { productId: product.id, isActive: true, deletedAt: null },
      }),
    ).toBe(1);
  });

  it('AuditLog variant.create/update/delete', async () => {
    const p = await mkProduct();
    const v = await addVariant(p.id, { stock: 3, price: 50000 });
    await patch(`/admin/variants/${v.id}`, { price: 60000, name: 'Tên khác' });
    await patch(`/admin/variants/${v.id}`, { price: 60000 }); // không đổi -> không audit
    await del(`/admin/variants/${v.id}`);
    const logs = await prisma.auditLog.findMany({
      where: { entity: 'ProductVariant', entityId: v.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'variant.create',
      'variant.update',
      'variant.delete',
    ]);
    expect((logs[0]!.diff as Json).price).toEqual([null, 50000]);
    expect((logs[0]!.diff as Json).stock).toEqual([null, 3]);
    expect(logs[1]!.diff).toEqual({ price: [50000, 60000], name: ['Biến thể', 'Tên khác'] });
    expect((logs[2]!.diff as Json).deletedAt[0]).toBeNull();
  });
});

describe('ảnh sản phẩm', () => {
  const imgs = (p: string) => `/admin/products/${p}/images`;
  const primaries = (list: Json[]) => list.filter((i) => i.isPrimary).map((i) => i.id);

  it('ảnh đầu tự là primary; ảnh sau không; isPrimary:true bỏ cờ cũ; sortOrder cuối', async () => {
    const p = await mkProduct();
    const r1 = await post(imgs(p.id), { url: imgUrl(1), alt: 'Ảnh 1', isPrimary: false });
    expect(r1.status).toBe(201);
    const l1 = dataOf(r1) as Json[];
    expect(l1).toHaveLength(1);
    expect(l1[0]).toMatchObject({ url: imgUrl(1), alt: 'Ảnh 1', isPrimary: true, sortOrder: 0 });
    expect(Object.keys(l1[0]).sort()).toEqual(['alt', 'id', 'isPrimary', 'sortOrder', 'url']);

    const l2 = dataOf(await post(imgs(p.id), { url: 'https://cdn.example.com/a.jpg' })) as Json[];
    expect(l2.map((i) => [i.isPrimary, i.sortOrder])).toEqual([
      [true, 0],
      [false, 1],
    ]);
    expect(l2[1].alt).toBe('');

    const l3 = dataOf(await post(imgs(p.id), { url: imgUrl(3), isPrimary: true })) as Json[];
    expect(l3).toHaveLength(3);
    expect(primaries(l3)).toEqual([l3[2].id]);
    expect(l3[2].sortOrder).toBe(2);
  });

  it('PATCH đổi ảnh chính (đúng 1 primary), đổi alt; isPrimary:false -> 400', async () => {
    const p = await mkProduct();
    await post(imgs(p.id), { url: imgUrl(1) });
    await post(imgs(p.id), { url: imgUrl(2) });
    const list = dataOf(await post(imgs(p.id), { url: imgUrl(3) })) as Json[];

    const r = await patch(`${imgs(p.id)}/${list[1].id}`, { isPrimary: true, alt: 'Mới' });
    expect(r.status).toBe(200);
    const after = dataOf(r) as Json[];
    expect(primaries(after)).toEqual([list[1].id]);
    expect(after[1].alt).toBe('Mới');
    expect(await prisma.productImage.count({ where: { productId: p.id, isPrimary: true } })).toBe(
      1,
    );

    // Đặt lại ảnh đang là primary: vẫn đúng 1 primary
    const same = dataOf(await patch(`${imgs(p.id)}/${list[1].id}`, { isPrimary: true })) as Json[];
    expect(primaries(same)).toEqual([list[1].id]);

    expect((await patch(`${imgs(p.id)}/${list[0].id}`, { isPrimary: false })).status).toBe(400);
    expect((await patch(`${imgs(p.id)}/${list[0].id}`, {})).status).toBe(400);
    expect((await patch(`${imgs(p.id)}/${list[0].id}`, { alt: 'a'.repeat(201) })).status).toBe(400);
  });

  it('reorder: đúng tập thì đổi sortOrder; thiếu / thừa / trùng / id lạ -> 400', async () => {
    const p = await mkProduct();
    await post(imgs(p.id), { url: imgUrl(1) });
    await post(imgs(p.id), { url: imgUrl(2) });
    const list = dataOf(await post(imgs(p.id), { url: imgUrl(3) })) as Json[];
    const [a, b, c] = list.map((i) => i.id as string) as [string, string, string];
    const order = `${imgs(p.id)}/order`;

    const ok = await put(order, { imageIds: [c, a, b] });
    expect(ok.status).toBe(200);
    const sorted = dataOf(ok) as Json[];
    expect(sorted.map((i) => [i.id, i.sortOrder])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);
    expect(primaries(sorted)).toEqual([a]); // reorder không đổi ảnh chính

    for (const imageIds of [
      [a, b],
      [a, b, c, c],
      [a, a, b],
      [a, b, 'clxxxxxxxxxxxxxxxxxxxxxxx'],
      [],
    ]) {
      const bad = await put(order, { imageIds });
      expect(bad.status, JSON.stringify(imageIds)).toBe(400);
      expect(errOf(bad as unknown as Parameters<typeof errOf>[0]).code).toBe('VALIDATION_ERROR');
    }
    expect((await put(order, {})).status).toBe(400);

    // Ảnh của sản phẩm khác trong tập -> 400
    const other = await mkProduct();
    const otherImg = (dataOf(await post(imgs(other.id), { url: imgUrl(9) })) as Json[])[0];
    expect((await put(order, { imageIds: [a, b, otherImg.id] })).status).toBe(400);
    // Thứ tự cũ vẫn còn
    const now = (dataOf(await get(`/admin/products/${p.id}`)).images as Json[]).map((i) => i.id);
    expect(now).toEqual([c, a, b]);
  });

  it('xóa ảnh primary -> ảnh sortOrder nhỏ nhất còn lại lên primary; xóa ảnh thường giữ primary', async () => {
    const p = await mkProduct();
    await post(imgs(p.id), { url: imgUrl(1) });
    await post(imgs(p.id), { url: imgUrl(2) });
    const list = dataOf(await post(imgs(p.id), { url: imgUrl(3) })) as Json[];
    const [a, b, c] = list.map((i) => i.id as string) as [string, string, string];
    await put(`${imgs(p.id)}/order`, { imageIds: [b, c, a] }); // a primary, sortOrder 2

    const r1 = await del(`${imgs(p.id)}/${a}`);
    expect(r1.status).toBe(200);
    const l1 = dataOf(r1) as Json[];
    expect(l1.map((i) => i.id)).toEqual([b, c]);
    expect(primaries(l1)).toEqual([b]);

    const l2 = dataOf(await del(`${imgs(p.id)}/${c}`)) as Json[];
    expect(primaries(l2)).toEqual([b]);

    const l3 = dataOf(await del(`${imgs(p.id)}/${b}`)) as Json[];
    expect(l3).toEqual([]);
    expect((await del(`${imgs(p.id)}/${b}`)).status).toBe(404);
  });

  it('giới hạn 10 ảnh/sản phẩm -> 409 CONFLICT', async () => {
    const p = await mkProduct();
    for (let i = 1; i <= 10; i++) {
      const r = await post(imgs(p.id), { url: imgUrl(i) });
      expect(r.status).toBe(201);
    }
    const over = await post(imgs(p.id), { url: imgUrl(11) });
    expect(over.status).toBe(409);
    expect(errOf(over).code).toBe('CONFLICT');
    expect(await prisma.productImage.count({ where: { productId: p.id } })).toBe(10);

    // Xóa 1 thì thêm được
    const first = (
      await prisma.productImage.findFirstOrThrow({ where: { productId: p.id, isPrimary: false } })
    ).id;
    await del(`${imgs(p.id)}/${first}`);
    expect((await post(imgs(p.id), { url: imgUrl(12) })).status).toBe(201);
  });

  it('song song: thêm ảnh vượt giới hạn không vượt quá 10 và luôn đúng 1 primary', async () => {
    const p = await mkProduct();
    for (let i = 1; i <= 8; i++) await post(imgs(p.id), { url: imgUrl(i) });
    const results = await Promise.all(
      [9, 10, 11, 12].map((i) => post(imgs(p.id), { url: imgUrl(i), isPrimary: true })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await prisma.productImage.count({ where: { productId: p.id } })).toBe(10);
    expect(await prisma.productImage.count({ where: { productId: p.id, isPrimary: true } })).toBe(
      1,
    );
  });

  it('URL không hợp lệ -> 400 (javascript:, data:, http:, .., //)', async () => {
    const p = await mkProduct();
    for (const url of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://example.com/a.jpg',
      '/uploads/../etc/passwd',
      '/uploads//x.jpg',
      '/other/x.jpg',
      'ftp://x/y.jpg',
      '',
      `https://example.com/${'a'.repeat(500)}`,
    ]) {
      const r = await post(imgs(p.id), { url });
      expect(r.status, url).toBe(400);
      expect((errOf(r).details as Json[])[0].field).toBe('url');
    }
    expect((await post(imgs(p.id), {})).status).toBe(400);
    expect((await post(imgs(p.id), { url: imgUrl(1), alt: 'a'.repeat(201) })).status).toBe(400);
    expect(await prisma.productImage.count({ where: { productId: p.id } })).toBe(0);
  });

  it('ảnh của sản phẩm khác / không tồn tại -> 404; sản phẩm đã xóa mềm -> 404', async () => {
    const a = await mkProduct();
    const b = await mkProduct();
    const imgA = (dataOf(await post(imgs(a.id), { url: imgUrl(1) })) as Json[])[0];

    expect((await patch(`${imgs(b.id)}/${imgA.id}`, { alt: 'x' })).status).toBe(404);
    expect((await del(`${imgs(b.id)}/${imgA.id}`)).status).toBe(404);
    expect((await patch(`${imgs(a.id)}/clxxxxxxxxxxxxxxxxxxxxxxx`, { alt: 'x' })).status).toBe(404);
    expect((await patch(`${imgs(a.id)}/BAD!ID`, { alt: 'x' })).status).toBe(404);
    expect((await post(imgs('clxxxxxxxxxxxxxxxxxxxxxxx'), { url: imgUrl(1) })).status).toBe(404);
    // ảnh A không bị ảnh hưởng
    expect(await prisma.productImage.count({ where: { productId: a.id } })).toBe(1);

    await del(`/admin/products/${a.id}`, admin.who);
    expect((await post(imgs(a.id), { url: imgUrl(2) })).status).toBe(404);
    expect((await patch(`${imgs(a.id)}/${imgA.id}`, { alt: 'x' })).status).toBe(404);
    expect((await put(`${imgs(a.id)}/order`, { imageIds: [imgA.id] })).status).toBe(404);
    expect((await del(`${imgs(a.id)}/${imgA.id}`)).status).toBe(404);
    expect(await prisma.productImage.count({ where: { productId: a.id } })).toBe(1);
  });

  it('GET chi tiết trả images sắp theo sortOrder; AuditLog image.*', async () => {
    const p = await mkProduct();
    await post(imgs(p.id), { url: imgUrl(1) });
    const list = dataOf(await post(imgs(p.id), { url: imgUrl(2) })) as Json[];
    const [a, b] = list.map((i) => i.id as string) as [string, string];
    await patch(`${imgs(p.id)}/${b}`, { alt: 'Đổi alt', isPrimary: true });
    await put(`${imgs(p.id)}/order`, { imageIds: [b, a] });
    await del(`${imgs(p.id)}/${a}`);

    const detail = dataOf(await get(`/admin/products/${p.id}`));
    expect(detail.images.map((i: Json) => i.id)).toEqual([b]);

    const logs = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'image.' }, entityId: { in: [a, b, p.id] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'image.create',
      'image.create',
      'image.update',
      'image.reorder',
      'image.delete',
    ]);
    expect((logs[2]!.diff as Json).alt).toEqual(['', 'Đổi alt']);
    expect((logs[2]!.diff as Json).isPrimary).toEqual([false, true]);
  });
});

describe('POST /admin/uploads', () => {
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF'),
  ]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('IHDR-data'),
  ]);
  const webp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x1a, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 '),
  ]);
  const URL_RE = /^\/uploads\/products\/\d{4}\/\d{2}\/[0-9a-f]{32}\.(jpg|png|webp)$/;
  const fileOf = (url: string) => path.join(uploadsDir, url.replace('/uploads/', ''));
  const invalid = (res: request.Response) => {
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    expect(errOf(res).details).toEqual([
      { field: 'file', message: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP' },
    ]);
  };

  it.each([
    ['image/jpeg', jpeg, 'jpg'],
    ['image/png', png, 'png'],
    ['image/webp', webp, 'webp'],
  ] as const)(
    '%s hợp lệ -> 201, file tồn tại, phục vụ được qua /uploads',
    async (type, buf, ext) => {
      const res = await upload(buf, type);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const data = dataOf(res);
      expect(data).toEqual({
        url: expect.stringMatching(URL_RE),
        contentType: type,
        size: buf.length,
      });
      expect(data.url.endsWith(`.${ext}`)).toBe(true);

      const file = fileOf(data.url);
      expect(file.startsWith(uploadsDir)).toBe(true);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).equals(buf)).toBe(true);

      const served = await request(app).get(data.url);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toContain(type);
      expect(Buffer.from(served.body as Buffer).equals(buf)).toBe(true);
    },
  );

  it('Content-Type có tham số (charset) vẫn nhận; hai lần upload ra hai tên khác nhau', async () => {
    const a = await upload(jpeg, 'image/jpeg; foo=bar');
    const b = await upload(jpeg, 'IMAGE/JPEG');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(dataOf(a).url).not.toBe(dataOf(b).url);
  });

  it('Content-Type sai hoặc body rỗng -> 400 field file', async () => {
    invalid(await upload(jpeg, 'image/gif'));
    invalid(await upload(jpeg, 'text/plain'));
    invalid(await upload(Buffer.from('{}'), 'application/json'));
    invalid(await upload(jpeg, 'application/octet-stream'));
    invalid(await upload(Buffer.alloc(0), 'image/jpeg'));
    const noType = await request(app)
      .post(`${API}/admin/uploads`)
      .set('Origin', ORIGIN)
      .set(staff.who.auth ?? {});
    invalid(noType);
  });

  it('magic bytes không khớp Content-Type -> 400', async () => {
    invalid(await upload(png, 'image/jpeg'));
    invalid(await upload(jpeg, 'image/png'));
    invalid(await upload(jpeg, 'image/webp'));
    invalid(await upload(webp, 'image/png'));
    invalid(await upload(Buffer.from('<?php echo 1; ?>'), 'image/jpeg'));
    invalid(
      await upload(
        Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]),
        'image/webp',
      ),
    );
    invalid(await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png')); // thiếu byte
    invalid(await upload(Buffer.from([0xff, 0xd8]), 'image/jpeg'));
  });

  it('đúng 5 MB được nhận; > 5 MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const limit = 5 * 1024 * 1024;
    const exact = Buffer.concat([jpeg, Buffer.alloc(limit - jpeg.length)]);
    const ok = await upload(exact, 'image/jpeg');
    expect(ok.status).toBe(201);
    expect(dataOf(ok).size).toBe(limit);

    const big = Buffer.concat([jpeg, Buffer.alloc(limit + 1 - jpeg.length)]);
    const res = await upload(big, 'image/jpeg');
    expect(res.status).toBe(413);
    expect(errOf(res).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('CUSTOMER 403, không token 401; STAFF và ADMIN được', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'upload.create' } });
    const c = await upload(jpeg, 'image/jpeg', customer.who);
    expect(c.status).toBe(403);
    expect(errOf(c).code).toBe('FORBIDDEN');
    expect((await upload(jpeg, 'image/jpeg', {})).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'upload.create' } })).toBe(before);

    expect((await upload(jpeg, 'image/jpeg', staff.who)).status).toBe(201);
    expect((await upload(png, 'image/png', admin.who)).status).toBe(201);
  });

  it('ghi AuditLog upload.create (entity Upload, entityId null, diff url)', async () => {
    const res = await upload(png, 'image/png');
    const url = dataOf(res).url as string;
    const logs = await prisma.auditLog.findMany({
      where: { action: 'upload.create', actorId: staff.id },
    });
    const log = logs.find((l) => (l.diff as Json)?.url?.[1] === url);
    expect(log).toBeTruthy();
    expect(log).toMatchObject({ entity: 'Upload', entityId: null });
    expect(log!.diff).toEqual({ url: [null, url] });
  });

  it('URL upload dùng được làm ảnh sản phẩm', async () => {
    const url = dataOf(await upload(jpeg, 'image/jpeg')).url as string;
    const p = await mkProduct();
    const r = await post(`/admin/products/${p.id}/images`, { url });
    expect(r.status).toBe(201);
    expect(dataOf(r)[0].url).toBe(url);
  });

  it('limiter riêng cho upload: vượt hạn mức -> 429 RATE_LIMITED + Retry-After', async () => {
    const limited = createApp({ ...BIG, uploadRateLimit: 2, uploadsDir });
    expect((await upload(jpeg, 'image/jpeg', staff.who, limited)).status).toBe(201);
    expect((await upload(jpeg, 'image/jpeg', staff.who, limited)).status).toBe(201);
    const third = await upload(jpeg, 'image/jpeg', staff.who, limited);
    expect(third.status).toBe(429);
    expect(errOf(third).code).toBe('RATE_LIMITED');
    expect(third.headers['retry-after']).toBeTruthy();
    expect((errOf(third).details as Json).retryAfterSec).toBeGreaterThan(0);
    // Các API admin khác không bị limiter upload chặn
    const other = await request(limited)
      .get(`${API}/admin/products?pageSize=1`)
      .set('Origin', ORIGIN)
      .set(staff.who.auth ?? {});
    expect(other.status).toBe(200);
  });
});

describe('Cache-Control admin', () => {
  it('response admin có no-store', async () => {
    const res = await get('/admin/products?pageSize=1');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
