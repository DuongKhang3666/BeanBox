import { z } from 'zod';
import { CsvParseError, parseCsv, unneutralizeFormula } from '../../../lib/csv.js';
import { SLUG_MAX, SLUG_REGEX } from '../../../lib/slug.js';
import { vnDayEnd, vnDayStart } from '../admin.schema.js';
import { checkPricing, PRODUCT_STATUSES, SKU_REGEX } from './products.schema.js';
import { RESERVED_PRODUCT_SLUGS, RESERVED_SLUG_MSG } from './products.service.js';

/**
 * Xuất/nhập CSV sản phẩm (D-073): phần THUẦN (không DB) gồm đọc file, kiểm từng dòng và lập
 * kế hoạch. Phần I/O nằm ở `productsCsv.service.ts`.
 */

export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

/** Tên cột cố định, đúng thứ tự xuất (api-contract §12.4b). */
export const PRODUCT_CSV_COLUMNS = [
  'product_slug',
  'product_name',
  'category_slug',
  'brand_slug',
  'status',
  'is_featured',
  'variant_sku',
  'variant_name',
  'price',
  'sale_price',
  'sale_start',
  'sale_end',
  'stock',
  'low_stock_threshold',
  'weight_gram',
  'is_active',
  'avg_cost',
] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

/**
 * Cột có thể vắng trong file nhập (file xuất trước D-078 không có): vắng = không đụng tới.
 * `avg_cost` (giá vốn bình quân, VND, rỗng = chưa có): nhập = "sửa giá vốn thủ công" có audit.
 */
export const OPTIONAL_COLUMNS: readonly ProductCsvColumn[] = ['avg_cost'];

export interface FieldIssue {
  field: string;
  message: string;
}

/** Lỗi cấp file (tiêu đề sai, quá số dòng, ngoặc kép hỏng...). */
export class ImportFileError extends Error {}

// ---------------------------------------------------------------------------
// Kiểm từng dòng

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} là bắt buộc`)
    .min(min, `${label} tối thiểu ${min} ký tự`)
    .max(max, `${label} tối đa ${max} ký tự`);

const int = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} là bắt buộc`)
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `${label} phải từ ${min} đến ${max}`)
        .max(max, `${label} phải từ ${min} đến ${max}`),
    );

const bool = (label: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['true', 'false', '1', '0'], { error: `${label} chỉ nhận true hoặc false` }))
    .transform((v) => v === 'true' || v === '1');

const slug = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} là bắt buộc`)
    .max(SLUG_MAX, `${label} tối đa ${SLUG_MAX} ký tự`)
    .regex(SLUG_REGEX, `${label} chỉ gồm chữ thường, số và dấu gạch ngang`);

/** Ô ngày giờ: ISO 8601 có múi giờ, hoặc `YYYY-MM-DD` (đầu/cuối ngày theo giờ Việt Nam). Rỗng -> null. */
const dateCell = (label: string, edge: 'start' | 'end') =>
  z
    .string()
    .trim()
    .transform((v, ctx): Date | null => {
      if (v === '') return null;
      let d: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, day] = v.split('-').map(Number) as [number, number, number];
        const probe = new Date(Date.UTC(y, m - 1, day));
        if (
          probe.getUTCFullYear() === y &&
          probe.getUTCMonth() === m - 1 &&
          probe.getUTCDate() === day
        ) {
          d = edge === 'start' ? vnDayStart(v) : vnDayEnd(v);
        }
      } else if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)
      ) {
        const t = new Date(v);
        if (!Number.isNaN(t.getTime())) d = t;
      }
      if (!d) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} không hợp lệ (dùng YYYY-MM-DD hoặc ISO 8601 có múi giờ)`,
        });
        return z.NEVER;
      }
      return d;
    });

const rowSchema = z.object({
  product_slug: slug('Slug sản phẩm'),
  product_name: text('Tên sản phẩm', 2, 200),
  category_slug: slug('Slug danh mục'),
  brand_slug: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), slug('Slug thương hiệu')]))
    .transform((v) => (v === '' ? null : v)),
  status: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(PRODUCT_STATUSES, { error: 'Trạng thái phải là DRAFT, ACTIVE hoặc ARCHIVED' })),
  is_featured: bool('Nổi bật'),
  variant_sku: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z
        .string()
        .min(1, 'SKU là bắt buộc')
        .regex(
          SKU_REGEX,
          'SKU gồm 2-40 ký tự A-Z, 0-9 hoặc dấu gạch ngang, bắt đầu bằng chữ hoặc số',
        ),
    ),
  variant_name: text('Tên biến thể', 1, 100),
  price: int('Giá', 1, 100_000_000),
  sale_price: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.union([z.null(), int('Giá khuyến mãi', 1, 100_000_000)])),
  sale_start: dateCell('Bắt đầu khuyến mãi', 'start'),
  sale_end: dateCell('Kết thúc khuyến mãi', 'end'),
  stock: int('Tồn kho', 0, 100_000),
  low_stock_threshold: int('Ngưỡng sắp hết', 0, 1000),
  weight_gram: int('Khối lượng', 0, 100_000),
  is_active: bool('Đang bán'),
  // undefined = file không có cột này; '' = chưa có giá vốn (null).
  avg_cost: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.union([z.null(), int('Giá vốn', 0, 100_000_000)]))
    .optional(),
});

export interface ProductInfo {
  slug: string;
  name: string;
  categorySlug: string;
  brandSlug: string | null;
  status: (typeof PRODUCT_STATUSES)[number];
  isFeatured: boolean;
}

export interface VariantInfo {
  sku: string;
  name: string;
  price: number;
  salePrice: number | null;
  saleStart: Date | null;
  saleEnd: Date | null;
  stock: number;
  lowStockThreshold: number;
  weightGram: number;
  isActive: boolean;
  /** D-078: undefined = file không có cột `avg_cost`; null = rỗng (chưa có giá vốn). */
  avgCost?: number | null;
}

export interface ParsedRow {
  /** Số thứ tự bản ghi trong file, tính cả dòng tiêu đề (tiêu đề = 1) như số dòng trong Excel. */
  line: number;
  errors: FieldIssue[];
  data?: { product: ProductInfo; variant: VariantInfo };
}

function parseRow(line: number, cells: Record<ProductCsvColumn, string>): ParsedRow {
  const r = rowSchema.safeParse(cells);
  if (!r.success) {
    const seen = new Set<string>();
    const errors: FieldIssue[] = [];
    for (const i of r.error.issues) {
      const field = String(i.path[0] ?? 'row');
      if (seen.has(field)) continue; // mỗi cột báo 1 lỗi đầu tiên
      seen.add(field);
      errors.push({ field, message: i.message });
    }
    return { line, errors };
  }
  const v = r.data;
  const pricing = checkPricing({
    price: v.price,
    salePrice: v.sale_price,
    saleStart: v.sale_start,
    saleEnd: v.sale_end,
  });
  if (pricing) {
    const field = pricing.field === 'salePrice' ? 'sale_price' : 'sale_end';
    return { line, errors: [{ field, message: pricing.message }] };
  }
  return {
    line,
    errors: [],
    data: {
      product: {
        slug: v.product_slug,
        name: v.product_name,
        categorySlug: v.category_slug,
        brandSlug: v.brand_slug,
        status: v.status,
        isFeatured: v.is_featured,
      },
      variant: {
        sku: v.variant_sku,
        name: v.variant_name,
        price: v.price,
        salePrice: v.sale_price,
        saleStart: v.sale_start,
        saleEnd: v.sale_end,
        stock: v.stock,
        lowStockThreshold: v.low_stock_threshold,
        weightGram: v.weight_gram,
        isActive: v.is_active,
        ...(v.avg_cost !== undefined ? { avgCost: v.avg_cost } : {}),
      },
    },
  };
}

/**
 * Đọc nội dung CSV (đã giải mã UTF-8) thành các dòng đã kiểm. Mỗi ô được đảo tiền tố `'`
 * (xem `unneutralizeFormula`) TRƯỚC khi kiểm. Lỗi cấp file ném `ImportFileError`.
 */
export function parseProductCsv(content: string): ParsedRow[] {
  let records: string[][];
  try {
    records = parseCsv(content);
  } catch (e) {
    if (e instanceof CsvParseError) {
      throw new ImportFileError(
        `File CSV không đúng định dạng (gần bản ghi ${e.line}): ${e.message}`,
      );
    }
    throw e;
  }
  const header = records[0];
  if (!header) throw new ImportFileError('File CSV trống');
  const names = header.map((h) => h.trim());
  const missing = PRODUCT_CSV_COLUMNS.filter(
    (c) => !names.includes(c) && !OPTIONAL_COLUMNS.includes(c),
  );
  const unknown = names.filter((n) => !(PRODUCT_CSV_COLUMNS as readonly string[]).includes(n));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (missing.length > 0 || unknown.length > 0 || dup.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`thiếu cột: ${missing.join(', ')}`);
    if (unknown.length > 0) parts.push(`cột không hỗ trợ: ${unknown.join(', ')}`);
    if (dup.length > 0) parts.push(`cột bị lặp: ${[...new Set(dup)].join(', ')}`);
    throw new ImportFileError(`Dòng tiêu đề không đúng (${parts.join('; ')})`);
  }
  const body = records.slice(1);
  if (body.length === 0) throw new ImportFileError('File CSV không có dòng dữ liệu');
  if (body.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError(`File có ${body.length} dòng, tối đa ${IMPORT_MAX_ROWS} dòng`);
  }
  return body.map((cells, i) => {
    const line = i + 2;
    if (cells.length !== names.length) {
      return {
        line,
        errors: [
          {
            field: 'row',
            message: `Dòng có ${cells.length} cột, cần ${names.length} cột`,
          },
        ],
      };
    }
    const obj = {} as Record<ProductCsvColumn, string>;
    names.forEach((n, idx) => {
      obj[n as ProductCsvColumn] = unneutralizeFormula(cells[idx]!);
    });
    return parseRow(line, obj);
  });
}

// ---------------------------------------------------------------------------
// Kế hoạch

export interface ExistingVariant extends Omit<VariantInfo, 'sku' | 'avgCost'> {
  id: string;
  avgCost: number | null;
  sku: string;
  productSlug: string;
  deletedAt: Date | null;
}

export interface ExistingProduct {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  brandSlug: string | null;
  status: string;
  isFeatured: boolean;
  deletedAt: Date | null;
  /** Biến thể chưa xóa mềm. */
  variants: ExistingVariant[];
}

export interface PlanContext {
  productsBySlug: ReadonlyMap<string, ExistingProduct>;
  /** Mọi biến thể khớp SKU của file, kể cả đã xóa mềm. */
  variantsBySku: ReadonlyMap<string, ExistingVariant>;
  categorySlugs: ReadonlySet<string>;
  brandSlugs: ReadonlySet<string>;
}

export const IMPORT_ACTIONS = [
  'create_product',
  'create_variant',
  'update_variant',
  'update_product',
  'unchanged',
  'error',
] as const;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];

export interface PlanEntry {
  line: number;
  action: ImportAction;
  productSlug: string | null;
  sku: string | null;
  /** Cột đổi (update_*). */
  changes?: string[];
  errors?: FieldIssue[];
}

export type PlanOp =
  | { kind: 'create_product'; product: ProductInfo }
  | { kind: 'update_product'; id: string; patch: Partial<ProductInfo> }
  | { kind: 'create_variant'; productSlug: string; variant: VariantInfo }
  | {
      kind: 'update_variant';
      id: string;
      sku: string;
      patch: Partial<VariantInfo>;
      stockFrom: number;
      avgCostFrom: number | null;
    };

export interface ImportPlan {
  entries: PlanEntry[];
  ops: PlanOp[];
  summary: Record<ImportAction, number> & { rows: number };
}

const sameDate = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

function productChanges(ex: ExistingProduct, p: ProductInfo): Partial<ProductInfo> {
  const patch: Partial<ProductInfo> = {};
  if (ex.name !== p.name) patch.name = p.name;
  if (ex.categorySlug !== p.categorySlug) patch.categorySlug = p.categorySlug;
  if (ex.brandSlug !== p.brandSlug) patch.brandSlug = p.brandSlug;
  if (ex.status !== p.status) patch.status = p.status;
  if (ex.isFeatured !== p.isFeatured) patch.isFeatured = p.isFeatured;
  return patch;
}

function variantChanges(ex: ExistingVariant, v: VariantInfo): Partial<VariantInfo> {
  const patch: Partial<VariantInfo> = {};
  if (ex.name !== v.name) patch.name = v.name;
  if (ex.price !== v.price) patch.price = v.price;
  if (ex.salePrice !== v.salePrice) patch.salePrice = v.salePrice;
  if (!sameDate(ex.saleStart, v.saleStart)) patch.saleStart = v.saleStart;
  if (!sameDate(ex.saleEnd, v.saleEnd)) patch.saleEnd = v.saleEnd;
  if (ex.stock !== v.stock) patch.stock = v.stock;
  if (ex.lowStockThreshold !== v.lowStockThreshold) patch.lowStockThreshold = v.lowStockThreshold;
  if (ex.weightGram !== v.weightGram) patch.weightGram = v.weightGram;
  if (ex.isActive !== v.isActive) patch.isActive = v.isActive;
  if (v.avgCost !== undefined && ex.avgCost !== v.avgCost) patch.avgCost = v.avgCost;
  return patch;
}

const PRODUCT_COLUMN_OF: Record<keyof ProductInfo, ProductCsvColumn> = {
  slug: 'product_slug',
  name: 'product_name',
  categorySlug: 'category_slug',
  brandSlug: 'brand_slug',
  status: 'status',
  isFeatured: 'is_featured',
};
const VARIANT_COLUMN_OF: Record<keyof VariantInfo, ProductCsvColumn> = {
  sku: 'variant_sku',
  name: 'variant_name',
  price: 'price',
  salePrice: 'sale_price',
  saleStart: 'sale_start',
  saleEnd: 'sale_end',
  stock: 'stock',
  lowStockThreshold: 'low_stock_threshold',
  weightGram: 'weight_gram',
  isActive: 'is_active',
  avgCost: 'avg_cost',
};

/** Lập kế hoạch từ các dòng đã kiểm và dữ liệu hiện có. Không ghi gì. */
export function buildImportPlan(rows: readonly ParsedRow[], ctx: PlanContext): ImportPlan {
  const errorsOf = new Map<number, FieldIssue[]>();
  const addError = (line: number, issue: FieldIssue) => {
    const list = errorsOf.get(line) ?? [];
    if (!list.some((x) => x.field === issue.field)) list.push(issue);
    errorsOf.set(line, list);
  };
  for (const r of rows) for (const e of r.errors) addError(r.line, e);

  const canon = new Map<string, { product: ProductInfo; line: number }>();
  const skuLine = new Map<string, number>();
  for (const r of rows) {
    if (!r.data) continue;
    const { product, variant } = r.data;

    if (RESERVED_PRODUCT_SLUGS.has(product.slug)) {
      addError(r.line, { field: 'product_slug', message: RESERVED_SLUG_MSG });
    }
    if (!ctx.categorySlugs.has(product.categorySlug)) {
      addError(r.line, { field: 'category_slug', message: 'Danh mục không tồn tại' });
    }
    if (product.brandSlug && !ctx.brandSlugs.has(product.brandSlug)) {
      addError(r.line, { field: 'brand_slug', message: 'Thương hiệu không tồn tại' });
    }

    const firstSku = skuLine.get(variant.sku);
    if (firstSku !== undefined) {
      addError(r.line, {
        field: 'variant_sku',
        message: `SKU trùng với dòng ${firstSku} trong file`,
      });
    } else {
      skuLine.set(variant.sku, r.line);
    }

    const first = canon.get(product.slug);
    if (!first) {
      canon.set(product.slug, { product, line: r.line });
    } else {
      for (const k of ['name', 'categorySlug', 'brandSlug', 'status', 'isFeatured'] as const) {
        if (first.product[k] !== product[k]) {
          addError(r.line, {
            field: PRODUCT_COLUMN_OF[k],
            message: `Khác với dòng ${first.line} cùng sản phẩm "${product.slug}"`,
          });
        }
      }
    }

    const exProduct = ctx.productsBySlug.get(product.slug);
    if (exProduct?.deletedAt) {
      addError(r.line, {
        field: 'product_slug',
        message: 'Sản phẩm này đã bị xóa, hãy khôi phục trước khi nhập',
      });
    }
    const exVariant = ctx.variantsBySku.get(variant.sku);
    if (exVariant) {
      if (exVariant.productSlug !== product.slug) {
        addError(r.line, {
          field: 'variant_sku',
          message: `SKU đã thuộc sản phẩm khác ("${exVariant.productSlug}")`,
        });
      } else if (exVariant.deletedAt) {
        addError(r.line, { field: 'variant_sku', message: 'SKU thuộc biến thể đã bị xóa' });
      }
    }
  }

  // Sản phẩm ACTIVE phải còn ít nhất 1 biến thể đang bán sau khi nhập.
  const bySlug = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    if (!r.data) continue;
    const list = bySlug.get(r.data.product.slug) ?? [];
    list.push(r);
    bySlug.set(r.data.product.slug, list);
  }
  for (const [pslug, list] of bySlug) {
    const head = list[0]!;
    if (head.data!.product.status !== 'ACTIVE') continue;
    if (list.some((r) => (errorsOf.get(r.line)?.length ?? 0) > 0)) continue;
    const inFile = new Set(list.map((r) => r.data!.variant.sku));
    const keptActive = (ctx.productsBySlug.get(pslug)?.variants ?? []).filter(
      (v) => !inFile.has(v.sku) && v.isActive,
    ).length;
    const fileActive = list.filter((r) => r.data!.variant.isActive).length;
    if (keptActive + fileActive === 0) {
      addError(head.line, {
        field: 'status',
        message: 'Sản phẩm ACTIVE cần ít nhất 1 biến thể đang bán (is_active = true)',
      });
    }
  }

  const entries: PlanEntry[] = [];
  const ops: PlanOp[] = [];
  const productDone = new Set<string>();
  for (const r of rows) {
    const errs = errorsOf.get(r.line);
    if (errs && errs.length > 0) {
      entries.push({
        line: r.line,
        action: 'error',
        productSlug: r.data?.product.slug ?? null,
        sku: r.data?.variant.sku ?? null,
        errors: errs,
      });
      continue;
    }
    const { product, variant } = r.data!;
    const base = { line: r.line, productSlug: product.slug, sku: variant.sku };
    const exProduct = ctx.productsBySlug.get(product.slug);
    const before = entries.length;

    if (!exProduct) {
      if (!productDone.has(product.slug)) {
        productDone.add(product.slug);
        entries.push({ ...base, action: 'create_product' });
        ops.push({ kind: 'create_product', product });
      } else {
        entries.push({ ...base, action: 'create_variant' });
      }
      ops.push({ kind: 'create_variant', productSlug: product.slug, variant });
      continue;
    }

    if (!productDone.has(product.slug)) {
      productDone.add(product.slug);
      const patch = productChanges(exProduct, product);
      const keys = Object.keys(patch) as Array<keyof ProductInfo>;
      if (keys.length > 0) {
        entries.push({
          ...base,
          action: 'update_product',
          changes: keys.map((k) => PRODUCT_COLUMN_OF[k]),
        });
        ops.push({ kind: 'update_product', id: exProduct.id, patch });
      }
    }
    const exVariant = ctx.variantsBySku.get(variant.sku);
    if (!exVariant) {
      entries.push({ ...base, action: 'create_variant' });
      ops.push({ kind: 'create_variant', productSlug: product.slug, variant });
    } else {
      const patch = variantChanges(exVariant, variant);
      const keys = Object.keys(patch) as Array<keyof VariantInfo>;
      if (keys.length > 0) {
        entries.push({
          ...base,
          action: 'update_variant',
          changes: keys.map((k) => VARIANT_COLUMN_OF[k]),
        });
        ops.push({
          kind: 'update_variant',
          id: exVariant.id,
          sku: exVariant.sku,
          patch,
          stockFrom: exVariant.stock,
          avgCostFrom: exVariant.avgCost,
        });
      }
    }
    if (entries.length === before) entries.push({ ...base, action: 'unchanged' });
  }

  const summary = { rows: rows.length } as ImportPlan['summary'];
  for (const a of IMPORT_ACTIONS) summary[a] = 0;
  for (const e of entries) summary[e.action]++;
  return { entries, ops, summary };
}
