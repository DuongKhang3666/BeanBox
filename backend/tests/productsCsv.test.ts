import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv.js';
import {
  buildImportPlan,
  IMPORT_MAX_ROWS,
  ImportFileError,
  PRODUCT_CSV_COLUMNS,
  parseProductCsv,
  type ExistingProduct,
  type ExistingVariant,
  type PlanContext,
} from '../src/modules/admin/products/productsCsv.js';

const HEADER = [...PRODUCT_CSV_COLUMNS];

function row(over: Partial<Record<(typeof PRODUCT_CSV_COLUMNS)[number], string | number>> = {}) {
  const base: Record<string, string | number> = {
    product_slug: 'ca-phe-a',
    product_name: 'Cà phê A',
    category_slug: 'cat',
    brand_slug: 'brand',
    status: 'ACTIVE',
    is_featured: 'false',
    variant_sku: 'SKU-A1',
    variant_name: '500 g',
    price: 100000,
    sale_price: '',
    sale_start: '',
    sale_end: '',
    stock: 10,
    low_stock_threshold: 5,
    weight_gram: 500,
    is_active: 'true',
    avg_cost: '',
    ...over,
  };
  return HEADER.map((c) => base[c]!);
}

const csv = (...rows: Array<Array<string | number>>) => toCsv([HEADER, ...rows]);

const variant = (over: Partial<ExistingVariant> = {}): ExistingVariant => ({
  id: 'v1',
  sku: 'SKU-A1',
  name: '500 g',
  price: 100000,
  salePrice: null,
  saleStart: null,
  saleEnd: null,
  stock: 10,
  lowStockThreshold: 5,
  weightGram: 500,
  isActive: true,
  avgCost: null,
  productSlug: 'ca-phe-a',
  deletedAt: null,
  ...over,
});

const product = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: 'p1',
  slug: 'ca-phe-a',
  name: 'Cà phê A',
  categorySlug: 'cat',
  brandSlug: 'brand',
  status: 'ACTIVE',
  isFeatured: false,
  deletedAt: null,
  variants: [variant()],
  ...over,
});

function ctx(products: ExistingProduct[] = [], extraVariants: ExistingVariant[] = []): PlanContext {
  const variantsBySku = new Map<string, ExistingVariant>();
  for (const p of products) for (const v of p.variants) variantsBySku.set(v.sku, v);
  for (const v of extraVariants) variantsBySku.set(v.sku, v);
  return {
    productsBySlug: new Map(products.map((p) => [p.slug, p])),
    variantsBySku,
    categorySlugs: new Set(['cat']),
    brandSlugs: new Set(['brand']),
  };
}

const planOf = (content: string, c: PlanContext) => buildImportPlan(parseProductCsv(content), c);

describe('parseProductCsv - file', () => {
  it('đọc BOM + CRLF, và LF không BOM', () => {
    const a = parseProductCsv(csv(row()));
    expect(a).toHaveLength(1);
    expect(a[0]!.errors).toEqual([]);
    expect(a[0]!.line).toBe(2);
    const lf = `${HEADER.join(',')}\n${row().join(',')}\n`;
    expect(parseProductCsv(lf)[0]!.errors).toEqual([]);
  });

  it('ô bọc ngoặc kép có dấu phẩy, ngoặc kép và xuống dòng', () => {
    const r = parseProductCsv(csv(row({ product_name: 'Cà phê "A", rang\nvừa' })));
    expect(r[0]!.errors).toEqual([]);
    expect(r[0]!.data!.product.name).toBe('Cà phê "A", rang\nvừa');
  });

  it('đảo tiền tố nháy đơn chỉ khi theo sau ký tự nguy hiểm', () => {
    const raw = [
      HEADER.join(','),
      row({ product_name: "'=Cà phê A" }).join(','),
      row({ variant_sku: 'SKU-A2', variant_name: "'500 g" }).join(','),
    ].join('\r\n');
    const r = parseProductCsv(raw);
    expect(r[0]!.data!.product.name).toBe('=Cà phê A');
    expect(r[1]!.data!.variant.name).toBe("'500 g");
    // Ghi bằng toCsv rồi đọc lại: tên bắt đầu bằng nháy + ký tự nguy hiểm khứ hồi đúng.
    const rt = parseProductCsv(csv(row({ product_name: "'=Cà phê A" })));
    expect(rt[0]!.data!.product.name).toBe("'=Cà phê A");
  });

  it.each([
    ['rỗng', ''],
    ['chỉ tiêu đề', `${HEADER.join(',')}\r\n`],
  ])('file %s -> ImportFileError', (_n, content) => {
    expect(() => parseProductCsv(content)).toThrow(ImportFileError);
  });

  it('tiêu đề thiếu/thừa/lặp cột -> ImportFileError nêu rõ', () => {
    const missing = HEADER.filter((c) => c !== 'stock').join(',') + '\n1';
    expect(() => parseProductCsv(missing)).toThrow(/thiếu cột: stock/);
    expect(() => parseProductCsv(`${HEADER.join(',')},extra\n${row().join(',')},x`)).toThrow(
      /cột không hỗ trợ: extra/,
    );
    expect(() => parseProductCsv(`${HEADER.join(',')},stock\n${row().join(',')},1`)).toThrow(
      /cột bị lặp: stock/,
    );
  });

  it('quá số dòng tối đa và ngoặc kép hỏng -> ImportFileError', () => {
    const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) =>
      row({ variant_sku: `SKU-${i}` }),
    );
    expect(() => parseProductCsv(csv(...many))).toThrow(/tối đa 2000/);
    expect(() => parseProductCsv(`${HEADER.join(',')}\n"abc`)).toThrow(ImportFileError);
  });

  it('thứ tự cột tùy ý vẫn đọc đúng', () => {
    const rev = [...HEADER].reverse();
    const base = row();
    const content = toCsv([rev, [...base].reverse()]);
    expect(parseProductCsv(content)[0]!.data!.variant.sku).toBe('SKU-A1');
  });
});

describe('parseProductCsv - kiểm từng dòng', () => {
  const errOf = (over: Parameters<typeof row>[0]) => parseProductCsv(csv(row(over)))[0]!.errors;

  it('số cột sai -> lỗi cả dòng', () => {
    const r = parseProductCsv(`${HEADER.join(',')}\na,b`);
    expect(r[0]!.errors[0]).toMatchObject({ field: 'row' });
  });

  it.each([
    ['price', { price: '12.5' }],
    ['price', { price: '-5' }],
    ['price', { price: 0 }],
    ['price', { price: '' }],
    ['stock', { stock: '1e3' }],
    ['stock', { stock: -1 }],
    ['low_stock_threshold', { low_stock_threshold: 1001 }],
    ['weight_gram', { weight_gram: 100001 }],
    ['status', { status: 'PUBLISHED' }],
    ['is_featured', { is_featured: 'yes' }],
    ['is_active', { is_active: '' }],
    ['product_slug', { product_slug: 'Có Dấu' }],
    ['product_slug', { product_slug: '' }],
    ['category_slug', { category_slug: 'A B' }],
    ['brand_slug', { brand_slug: 'A B' }],
    ['variant_sku', { variant_sku: '#' }],
    ['product_name', { product_name: 'A' }],
    ['variant_name', { variant_name: '' }],
    ['sale_start', { sale_start: '2026-02-31' }],
    ['sale_end', { sale_end: 'mai' }],
    ['sale_price', { sale_price: 'abc' }],
  ] as const)('cột %s sai -> lỗi theo cột', (field, over) => {
    const e = errOf(over);
    expect(e.map((x) => x.field)).toContain(field);
    expect(e.find((x) => x.field === field)!.message.length).toBeGreaterThan(3);
  });

  it('sale_price phải nhỏ hơn price; ngày kết thúc phải sau ngày bắt đầu', () => {
    expect(errOf({ sale_price: 100000 })[0]).toMatchObject({ field: 'sale_price' });
    expect(
      errOf({ sale_price: 90000, sale_start: '2026-05-02', sale_end: '2026-05-01' })[0],
    ).toMatchObject({ field: 'sale_end' });
  });

  it('chuẩn hóa: status/SKU viết thường được nhận, brand rỗng = null, ngày hợp lệ', () => {
    const [r] = parseProductCsv(
      csv(
        row({
          status: 'active',
          variant_sku: 'sku-a1',
          brand_slug: '',
          is_active: 'TRUE',
          is_featured: '1',
          sale_price: 90000,
          sale_start: '2026-05-01',
          sale_end: '2026-05-31T10:00:00+07:00',
        }),
      ),
    );
    expect(r!.errors).toEqual([]);
    expect(r!.data!.product).toMatchObject({ status: 'ACTIVE', brandSlug: null, isFeatured: true });
    expect(r!.data!.variant.sku).toBe('SKU-A1');
    expect(r!.data!.variant.saleStart!.toISOString()).toBe('2026-04-30T17:00:00.000Z');
    expect(r!.data!.variant.saleEnd!.toISOString()).toBe('2026-05-31T03:00:00.000Z');
  });
});

describe('buildImportPlan', () => {
  it('sản phẩm/biến thể mới: create_product rồi create_variant', () => {
    const plan = planOf(csv(row(), row({ variant_sku: 'SKU-A2', variant_name: '1 kg' })), ctx());
    expect(plan.entries.map((e) => e.action)).toEqual(['create_product', 'create_variant']);
    expect(plan.ops.map((o) => o.kind)).toEqual([
      'create_product',
      'create_variant',
      'create_variant',
    ]);
    expect(plan.summary).toMatchObject({ rows: 2, create_product: 1, create_variant: 1, error: 0 });
  });

  it('khớp hoàn toàn dữ liệu hiện có -> unchanged, không có thao tác', () => {
    const plan = planOf(csv(row()), ctx([product()]));
    expect(plan.entries[0]!.action).toBe('unchanged');
    expect(plan.ops).toEqual([]);
  });

  it('đổi giá/tồn -> update_variant kèm danh sách cột đổi và tồn kho cũ', () => {
    const plan = planOf(csv(row({ price: 120000, stock: 3 })), ctx([product()]));
    const e = plan.entries[0]!;
    expect(e.action).toBe('update_variant');
    expect(e.changes).toEqual(['price', 'stock']);
    expect(plan.ops[0]).toMatchObject({ kind: 'update_variant', stockFrom: 10, id: 'v1' });
  });

  it('đổi thông tin sản phẩm -> update_product (1 lần cho nhiều dòng) + update_variant', () => {
    const plan = planOf(
      csv(
        row({ product_name: 'Cà phê A mới', is_featured: 'true', price: 110000 }),
        row({ product_name: 'Cà phê A mới', is_featured: 'true', variant_sku: 'SKU-A2' }),
      ),
      ctx([product()]),
    );
    expect(plan.entries.map((e) => e.action)).toEqual([
      'update_product',
      'update_variant',
      'create_variant',
    ]);
    expect(plan.entries[0]!.changes).toEqual(['product_name', 'is_featured']);
  });

  it('ngày khuyến mãi so theo thời điểm, không theo chuỗi', () => {
    const v = variant({
      salePrice: 90000,
      saleStart: new Date('2026-04-30T17:00:00.000Z'),
      saleEnd: new Date('2026-05-31T16:59:59.999Z'),
    });
    const plan = planOf(
      csv(row({ sale_price: 90000, sale_start: '2026-05-01', sale_end: '2026-05-31' })),
      ctx([product({ variants: [v] })]),
    );
    expect(plan.entries[0]!.action).toBe('unchanged');
  });

  it('slug dành riêng (compare) -> lỗi', () => {
    const plan = planOf(csv(row({ product_slug: 'compare' })), ctx());
    expect(plan.entries[0]).toMatchObject({ action: 'error' });
    expect(plan.entries[0]!.errors![0]).toMatchObject({ field: 'product_slug' });
  });

  it('danh mục/thương hiệu không tồn tại -> lỗi theo cột', () => {
    const plan = planOf(csv(row({ category_slug: 'khong-co', brand_slug: 'khong-co' })), ctx());
    expect(plan.entries[0]!.errors!.map((e) => e.field)).toEqual(['category_slug', 'brand_slug']);
  });

  it('SKU trùng trong file -> lỗi dòng sau', () => {
    const plan = planOf(csv(row(), row()), ctx());
    expect(plan.entries.map((e) => e.action)).toEqual(['create_product', 'error']);
    expect(plan.entries[1]!.errors![0]!.message).toContain('dòng 2');
  });

  it('các dòng cùng slug nhưng thông tin sản phẩm khác nhau -> lỗi', () => {
    const plan = planOf(
      csv(row(), row({ variant_sku: 'SKU-A2', product_name: 'Tên khác', status: 'DRAFT' })),
      ctx(),
    );
    expect(plan.entries[1]!.errors!.map((e) => e.field)).toEqual(['product_name', 'status']);
  });

  it('SKU đã thuộc sản phẩm khác -> lỗi; SKU của biến thể đã xóa -> lỗi', () => {
    const other = variant({ sku: 'SKU-X', productSlug: 'san-pham-khac' });
    const deleted = variant({ id: 'v9', sku: 'SKU-DEL', deletedAt: new Date() });
    const plan = planOf(
      csv(row({ variant_sku: 'SKU-X' }), row({ variant_sku: 'SKU-DEL', product_slug: 'ca-phe-a' })),
      ctx([product()], [other, deleted]),
    );
    expect(plan.entries[0]!.errors![0]).toMatchObject({ field: 'variant_sku' });
    expect(plan.entries[0]!.errors![0]!.message).toContain('san-pham-khac');
    expect(plan.entries[1]!.errors![0]!.message).toContain('đã bị xóa');
  });

  it('sản phẩm đã xóa mềm -> lỗi', () => {
    const plan = planOf(csv(row()), ctx([product({ deletedAt: new Date() })]));
    expect(plan.entries[0]!.errors![0]).toMatchObject({ field: 'product_slug' });
  });

  it('ACTIVE nhưng mọi biến thể ngừng bán -> lỗi ở cột status', () => {
    const plan = planOf(csv(row({ is_active: 'false' })), ctx());
    expect(plan.entries[0]!.errors![0]).toMatchObject({ field: 'status' });
    // DRAFT thì được
    expect(planOf(csv(row({ is_active: 'false', status: 'DRAFT' })), ctx()).summary.error).toBe(0);
  });

  it('biến thể vắng mặt trong file không bị xóa và vẫn tính là đang bán', () => {
    const keep = variant({ id: 'v2', sku: 'SKU-KEEP' });
    const plan = planOf(
      csv(row({ is_active: 'false' })),
      ctx([product({ variants: [variant(), keep] })]),
    );
    expect(plan.summary.error).toBe(0);
    expect(plan.ops.map((o) => o.kind)).toEqual(['update_variant']);
  });
});
