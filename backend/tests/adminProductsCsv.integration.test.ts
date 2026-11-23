import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseCsv, toCsv, unneutralizeFormula } from '../src/lib/csv.js';
import { prisma } from '../src/lib/prisma.js';
import { PRODUCT_CSV_COLUMNS } from '../src/modules/admin/products/productsCsv.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

/** D-073: xuất/nhập CSV sản phẩm. */

const PREFIX = 'tw4p-';
const UPPER = PREFIX.toUpperCase();
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
const CAT = `${PREFIX}cat`;
const BRAND = `${PREFIX}brand`;

const HEADER = [...PRODUCT_CSV_COLUMNS];
type Cell = string | number;
function line(over: Record<string, Cell> = {}): Cell[] {
  const base: Record<string, Cell> = {
    product_slug: `${PREFIX}ca-phe`,
    product_name: 'Cà phê thử nghiệm',
    category_slug: CAT,
    brand_slug: BRAND,
    status: 'ACTIVE',
    is_featured: 'false',
    variant_sku: `${UPPER}A1`,
    variant_name: '500 g',
    price: 120000,
    sale_price: '',
    sale_start: '',
    sale_end: '',
    stock: 20,
    low_stock_threshold: 5,
    weight_gram: 500,
    is_active: 'true',
    ...over,
  };
  return HEADER.map((c) => base[c]!);
}
const file = (...rows: Cell[][]) => Buffer.from(toCsv([HEADER, ...rows]), 'utf8');

const post = (
  path: string,
  body: Buffer | string,
  who: Who = admin.who,
  query: Record<string, string> = {},
  type = 'text/csv',
) =>
  request(app)
    .post(`${API}/admin/products/import/${path}`)
    .query(query)
    .set('Origin', ORIGIN)
    .set(who.auth ?? {})
    .set('Content-Type', type)
    .send(body);
const preview = (body: Buffer | string, who?: Who) => post('preview', body, who);
const commit = (body: Buffer, fingerprint: string, who?: Who) =>
  post('commit', body, who, { fingerprint, filename: 'Sản phẩm (1).csv' });

async function snapshot() {
  const [p, v, m, a] = await Promise.all([
    prisma.product.count({ where: { slug: { startsWith: PREFIX } } }),
    prisma.productVariant.findMany({
      where: { sku: { startsWith: UPPER } },
      orderBy: { sku: 'asc' },
    }),
    prisma.inventoryMovement.count({ where: { variant: { sku: { startsWith: UPPER } } } }),
    prisma.auditLog.count({ where: { action: { in: ['product.import', 'product.export'] } } }),
  ]);
  return JSON.stringify({ p, v, m, a });
}

async function cleanAudit() {
  await prisma.auditLog.deleteMany({
    where: { action: { in: ['product.import', 'product.export'] } },
  });
}

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    exportRateLimit: BIG,
    importRateLimit: BIG,
  });
  await fx.setup();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.create({ data: { name: 'Hãng thử', slug: BRAND } });
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  await cleanAudit();
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe('quyền và giới hạn', () => {
  it('export/preview/commit: 401 khách, 403 customer/staff', async () => {
    const customer = await fx.mkUser('cust');
    const f = file(line());
    for (const who of [{}, customer.who, staff.who]) {
      const exp = await request(app)
        .get(`${API}/admin/products/export`)
        .set(who.auth ?? {});
      expect(exp.status).toBe(who.auth ? 403 : 401);
      expect((await preview(f, who)).status).toBe(who.auth ? 403 : 401);
      expect((await commit(f, 'a'.repeat(64), who)).status).toBe(who.auth ? 403 : 401);
    }
  });

  it('rate limit riêng: vượt hạn mức preview -> 429, export không bị ảnh hưởng', async () => {
    const small = createApp({
      generalRateLimit: BIG,
      authRateLimit: BIG,
      importRateLimit: 2,
      exportRateLimit: BIG,
    });
    const send = () =>
      request(small)
        .post(`${API}/admin/products/import/preview`)
        .set('Origin', ORIGIN)
        .set(admin.who.auth!)
        .set('Content-Type', 'text/csv')
        .send(file(line()));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    const exp = await request(small).get(`${API}/admin/products/export`).set(admin.who.auth!);
    expect(exp.status).toBe(200);
  });

  it('request không có body / sai Content-Type / quá 1 MB / không phải UTF-8', async () => {
    const empty = await preview(Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect(errOf(empty).code).toBe('INVALID_CSV');

    const wrongType = await post('preview', file(line()), admin.who, {}, 'application/json');
    expect(wrongType.status).toBe(400);

    const big = await preview(Buffer.alloc(1024 * 1024 + 10, 'a'));
    expect(big.status).toBe(413);
    expect(errOf(big).code).toBe('PAYLOAD_TOO_LARGE');

    const latin1 = await preview(Buffer.from([0x61, 0x2c, 0xe9, 0x0a, 0x31]));
    expect(latin1.status).toBe(400);
    expect(errOf(latin1).message).toContain('UTF-8');
  });

  it('commit: fingerprint thiếu/sai định dạng -> 400', async () => {
    const res = await post('commit', file(line()), admin.who, { fingerprint: 'xyz' });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('file sai tiêu đề -> 400 INVALID_CSV nêu cột', async () => {
    const res = await preview('a,b\n1,2');
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('INVALID_CSV');
    expect(errOf(res).message).toContain('thiếu cột');
  });
});

describe('xem trước (preview) không ghi DB', () => {
  it('liệt kê hành động theo dòng, tóm tắt, fingerprint là SHA-256 của file', async () => {
    const before = await snapshot();
    const f = file(
      line(),
      line({ variant_sku: `${UPPER}A2`, variant_name: '1 kg', price: 230000 }),
      line({ product_slug: `${PREFIX}khac`, variant_sku: `${UPPER}B1` }),
    );
    const res = await preview(f);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(d.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(d.canApply).toBe(true);
    expect(d.summary).toMatchObject({ rows: 3, create_product: 2, create_variant: 1, error: 0 });
    expect(await snapshot()).toBe(before);
  });

  it('dòng lỗi: báo theo dòng + cột bằng tiếng Việt, canApply = false', async () => {
    const res = await preview(
      file(
        line({ price: 'abc', category_slug: 'khong-co' }),
        line({ variant_sku: `${UPPER}A2`, product_slug: 'compare' }),
      ),
    );
    const d = dataOf(res);
    expect(d.canApply).toBe(false);
    expect(d.summary.error).toBe(2);
    expect(d.entries[0]).toMatchObject({
      line: 2,
      action: 'error',
      errors: [{ field: 'price', message: expect.stringContaining('số nguyên') }],
    });
    expect(d.entries[1].errors[0].field).toBe('product_slug');
  });
});

describe('áp dụng (commit)', () => {
  const slug = `${PREFIX}ca-phe`;

  it('fingerprint không khớp -> 409, không ghi gì', async () => {
    const before = await snapshot();
    const f = file(line());
    const res = await commit(f, '0'.repeat(64));
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('FINGERPRINT_MISMATCH');
    expect(await snapshot()).toBe(before);
  });

  it('có lỗi -> 422, KHÔNG ghi gì (kể cả dòng hợp lệ trước đó)', async () => {
    const before = await snapshot();
    const f = file(
      line({ variant_sku: `${UPPER}OK1` }),
      line({ variant_sku: `${UPPER}BAD`, stock: -1 }),
    );
    const fp = dataOf(await preview(f)).fingerprint as string;
    const res = await commit(f, fp);
    expect(res.status).toBe(422);
    expect(errOf(res).code).toBe('IMPORT_HAS_ERRORS');
    expect((errOf(res).details as { errors: unknown[] }).errors).toHaveLength(1);
    expect(await snapshot()).toBe(before);
    expect(await prisma.product.count({ where: { slug } })).toBe(0);
  });

  it('tạo mới: sản phẩm + 2 biến thể + tồn kho ban đầu + denorm + audit', async () => {
    const f = file(
      line({ is_featured: 'true', stock: 20 }),
      line({
        is_featured: 'true',
        variant_sku: `${UPPER}A2`,
        variant_name: '1 kg',
        price: 230000,
        stock: 0,
      }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.summary).toMatchObject({ create_product: 1, create_variant: 1, error: 0 });
    expect(pv.canApply).toBe(true);

    const res = await commit(f, pv.fingerprint);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res).applied).toMatchObject({
      productsCreated: 1,
      variantsCreated: 2,
      stockMovements: 1,
    });

    const p = await prisma.product.findUniqueOrThrow({
      where: { slug },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    expect(p).toMatchObject({
      name: 'Cà phê thử nghiệm',
      status: 'ACTIVE',
      isFeatured: true,
      minPrice: 120000,
      inStock: true,
      description: '',
    });
    expect(p.searchText).toContain('ca phe thu nghiem');
    expect(p.variants.map((v) => [v.sku, v.price, v.stock, v.sortOrder])).toEqual([
      [`${UPPER}A1`, 120000, 20, 0],
      [`${UPPER}A2`, 230000, 0, 1],
    ]);
    const mv = await prisma.inventoryMovement.findMany({
      where: { variantId: p.variants[0]!.id },
    });
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      change: 20,
      stockAfter: 20,
      reason: 'STOCKTAKE',
      note: 'Nhập CSV',
      actorId: admin.id,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.import' } });
    expect(audit.actorId).toBe(admin.id);
    const diff = audit.diff as Record<string, [unknown, unknown]>;
    expect(diff.fileName![1]).toBe('s-n-ph-m-1-.csv');
    expect(diff.fingerprint![1]).toBe(pv.fingerprint);
    expect(diff.create_product![1]).toBe(1);
    expect(diff.create_variant![1]).toBe(1);
  });

  it('nhập lại cùng file -> toàn bộ unchanged, không ghi', async () => {
    const f = file(
      line({ is_featured: 'true', stock: 20 }),
      line({
        is_featured: 'true',
        variant_sku: `${UPPER}A2`,
        variant_name: '1 kg',
        price: 230000,
        stock: 0,
      }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.summary).toMatchObject({ unchanged: 2, error: 0, create_product: 0 });
    const before = await snapshot();
    const res = await commit(f, pv.fingerprint);
    expect(res.status).toBe(200);
    // Chỉ số audit tăng 1 (nhập luôn được ghi nhận); dữ liệu sản phẩm/tồn kho không đổi.
    const a = JSON.parse(before) as { a: number };
    const b = JSON.parse(await snapshot()) as { a: number };
    expect(b.a).toBe(a.a + 1);
    expect({ ...b, a: 0 }).toEqual({ ...a, a: 0 });
  });

  it('cập nhật: giá, khuyến mãi, tồn kho (InventoryMovement ADJUSTMENT), tên, nổi bật; slug/SKU giữ nguyên', async () => {
    const f = file(
      line({
        product_name: 'Cà phê đổi tên',
        is_featured: 'false',
        price: 130000,
        sale_price: 99000,
        sale_start: '2020-01-01',
        sale_end: '2099-12-31',
        stock: 12,
      }),
      line({
        product_name: 'Cà phê đổi tên',
        variant_sku: `${UPPER}A2`,
        variant_name: '1 kg',
        price: 230000,
        stock: 0,
      }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.entries.map((e: { action: string }) => e.action)).toEqual([
      'update_product',
      'update_variant',
      'unchanged',
    ]);
    expect(pv.entries[0].changes).toEqual(['product_name', 'is_featured']);
    expect(pv.entries[1].changes).toEqual([
      'price',
      'sale_price',
      'sale_start',
      'sale_end',
      'stock',
    ]);

    const res = await commit(f, pv.fingerprint);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res).applied).toMatchObject({
      productsUpdated: 1,
      variantsUpdated: 1,
      stockMovements: 1,
      unchanged: 1,
    });

    const p = await prisma.product.findUniqueOrThrow({
      where: { slug },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    expect(p).toMatchObject({ name: 'Cà phê đổi tên', isFeatured: false, minPrice: 99000 });
    expect(p.variants[0]).toMatchObject({ price: 130000, salePrice: 99000, stock: 12 });
    const mv = await prisma.inventoryMovement.findMany({
      where: { variantId: p.variants[0]!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(mv.map((m) => [m.reason, m.change, m.stockAfter, m.note])).toEqual([
      ['STOCKTAKE', 20, 20, 'Nhập CSV'],
      ['ADJUSTMENT', -8, 12, 'Nhập CSV'],
    ]);
    // Không tạo redirect slug, không đổi slug.
    expect(await prisma.slugRedirect.count({ where: { targetId: p.id } })).toBe(0);
  });

  it('SKU đã thuộc sản phẩm khác -> lỗi, không chuyển biến thể sang sản phẩm mới', async () => {
    const f = file(line({ product_slug: `${PREFIX}san-pham-khac`, product_name: 'Sản phẩm khác' }));
    const pv = dataOf(await preview(f));
    expect(pv.canApply).toBe(false);
    expect(pv.entries[0].errors[0]).toMatchObject({ field: 'variant_sku' });
    expect(pv.entries[0].errors[0].message).toContain(slug);
    expect((await commit(f, pv.fingerprint)).status).toBe(422);
    expect(await prisma.product.count({ where: { slug: `${PREFIX}san-pham-khac` } })).toBe(0);
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { sku: `${UPPER}A1` } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).slug).toBe(
      slug,
    );
  });

  it('thêm biến thể mới cho sản phẩm có sẵn; biến thể vắng mặt trong file KHÔNG bị xóa', async () => {
    const f = file(
      line({
        product_name: 'Cà phê đổi tên',
        variant_sku: `${UPPER}A3`,
        variant_name: '250 g',
        price: 70000,
        stock: 4,
      }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.entries.map((e: { action: string }) => e.action)).toEqual(['create_variant']);
    expect((await commit(f, pv.fingerprint)).status).toBe(200);
    const variants = await prisma.productVariant.findMany({
      where: { product: { slug } },
      orderBy: { sku: 'asc' },
    });
    expect(variants.map((v) => [v.sku, v.deletedAt])).toEqual([
      [`${UPPER}A1`, null],
      [`${UPPER}A2`, null],
      [`${UPPER}A3`, null],
    ]);
    expect(variants[2]!.sortOrder).toBe(2);
  });

  it('sản phẩm ACTIVE mà mọi biến thể ngừng bán -> lỗi; DRAFT thì được', async () => {
    const z = `${PREFIX}z`;
    const bad = file(line({ variant_sku: `${UPPER}Z1`, product_slug: z, is_active: 'false' }));
    expect(dataOf(await preview(bad)).summary.error).toBe(1);
    const ok = file(
      line({ variant_sku: `${UPPER}Z1`, product_slug: z, is_active: 'false', status: 'DRAFT' }),
    );
    const pv = dataOf(await preview(ok));
    expect(pv.canApply).toBe(true);
    expect((await commit(ok, pv.fingerprint)).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { slug: z } })).status).toBe('DRAFT');
  });

  it('sản phẩm đã xóa mềm -> lỗi', async () => {
    const z = `${PREFIX}z`;
    await prisma.product.update({ where: { slug: z }, data: { deletedAt: new Date() } });
    const f = file(
      line({ variant_sku: `${UPPER}Z1`, product_slug: z, is_active: 'false', status: 'DRAFT' }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.entries[0].errors[0].field).toBe('product_slug');
  });

  it('commit tính lại kế hoạch theo dữ liệu mới nhất (tồn kho đổi giữa preview và commit)', async () => {
    const f = file(
      line({
        product_name: 'Cà phê đổi tên',
        variant_sku: `${UPPER}A3`,
        variant_name: '250 g',
        price: 70000,
        stock: 4,
      }),
    );
    const pv = dataOf(await preview(f));
    expect(pv.summary.unchanged).toBe(1);
    await prisma.productVariant.update({ where: { sku: `${UPPER}A3` }, data: { stock: 50 } });
    const res = await commit(f, pv.fingerprint);
    expect(res.status).toBe(200);
    expect(dataOf(res).applied).toMatchObject({ variantsUpdated: 1, stockMovements: 1 });
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { sku: `${UPPER}A3` } });
    expect(v.stock).toBe(4);
    const mv = await prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId: v.id, reason: 'ADJUSTMENT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(mv).toMatchObject({ change: -46, stockAfter: 4 });
  });
});

describe('xuất CSV', () => {
  const slug = `${PREFIX}ca-phe`;

  it('Admin 200: header, BOM, CRLF, đúng cột, nội dung khớp DB, audit product.export', async () => {
    await cleanAudit();
    const res = await request(app)
      .get(`${API}/admin/products/export`)
      .set(admin.who.auth!)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="beanbox-products-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const raw = (res.body as Buffer).toString('utf8');
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    expect(raw).toContain('\r\n');
    const rows = parseCsv(raw);
    expect(rows[0]).toEqual(HEADER);
    const mine = rows.filter((r) => r[0]!.startsWith(PREFIX));
    expect(mine.map((r) => r[6])).toEqual([`${UPPER}A1`, `${UPPER}A2`, `${UPPER}A3`]);
    expect(mine[0]!.slice(0, 6)).toEqual([slug, 'Cà phê đổi tên', CAT, BRAND, 'ACTIVE', 'false']);
    expect(mine[0]!.slice(6)).toEqual([
      `${UPPER}A1`,
      '500 g',
      '130000',
      '99000',
      '2019-12-31T17:00:00.000Z',
      '2099-12-31T16:59:59.999Z',
      '12',
      '5',
      '500',
      'true',
      '', // avg_cost: chưa có giá vốn (D-078)
    ]);
    // Sản phẩm xóa mềm không xuất.
    expect(mine.some((r) => r[0] === `${PREFIX}z`)).toBe(false);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.export' } });
    expect(audit.actorId).toBe(admin.id);
  });

  it('chống CSV injection khi xuất; xuất -> nhập lại chính file đó: toàn bộ unchanged (khứ hồi)', async () => {
    const evilName = '=HYPERLINK("http://evil","x")';
    const prod = await prisma.product.findUniqueOrThrow({ where: { slug } });
    await prisma.product.update({ where: { id: prod.id }, data: { name: evilName } });
    await prisma.productVariant.update({
      where: { sku: `${UPPER}A2` },
      data: { name: '\'=a, "b"\nxuống dòng' },
    });
    await prisma.productVariant.update({ where: { sku: `${UPPER}A3` }, data: { name: '@sum' } });

    const res = await request(app).get(`${API}/admin/products/export`).set(admin.who.auth!);
    expect(res.status).toBe(200);
    const text = res.text;
    expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(text).not.toMatch(/,=HYPERLINK/);
    const cells = parseCsv(text)
      .filter((r) => r[0]!.startsWith(PREFIX))
      .map((r) => r.map(unneutralizeFormula));
    expect(cells[0]![1]).toBe(evilName);

    const body = Buffer.from(text, 'utf8');
    const pv = await preview(body);
    expect(pv.status).toBe(200);
    const d = dataOf(pv);
    const errors = d.entries.filter((e: { action: string }) => e.action === 'error');
    expect(errors).toEqual([]);
    expect(d.summary.unchanged).toBe(d.summary.rows);
    expect(d.canApply).toBe(true);
    const before = JSON.parse(await snapshot()) as { v: unknown };
    const done = await commit(body, d.fingerprint as string);
    expect(done.status).toBe(200);
    expect(dataOf(done).applied).toMatchObject({
      productsCreated: 0,
      variantsCreated: 0,
      productsUpdated: 0,
      variantsUpdated: 0,
      stockMovements: 0,
    });
    expect((JSON.parse(await snapshot()) as { v: unknown }).v).toEqual(before.v);
  });
});
