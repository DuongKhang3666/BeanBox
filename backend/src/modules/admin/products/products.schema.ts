import { z } from 'zod';
import { SLUG_MAX, SLUG_REGEX } from '../../../lib/slug.js';
import { csvEnum, dateOnly, idString, imageUrlSchema, paginationShape } from '../admin.schema.js';

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
const ROAST_LEVELS = ['LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK'] as const;
const PROCESSES = ['WASHED', 'NATURAL', 'HONEY', 'ANAEROBIC', 'OTHER'] as const;
const BREW_METHODS = [
  'PHIN',
  'ESPRESSO',
  'POUR_OVER',
  'COLD_BREW',
  'FRENCH_PRESS',
  'AEROPRESS',
  'MOKA',
] as const;

export const SKU_REGEX = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

const atLeastOne = (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
  if (!Object.values(v).some((x) => x !== undefined)) {
    ctx.addIssue({ code: 'custom', path: [], message: 'Cần ít nhất một trường để cập nhật' });
  }
};

/** undefined = không gửi; '' hoặc null = xóa giá trị (null). */
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

const intIn = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} phải là số nguyên` })
    .int(`${label} phải là số nguyên`)
    .min(min, `${label} phải từ ${min} đến ${max}`)
    .max(max, `${label} phải từ ${min} đến ${max}`);

const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];

// ---------------------------------------------------------------------------
// Sản phẩm

const slugSchema = z
  .string({ error: 'Slug không hợp lệ' })
  .trim()
  .min(2, 'Slug tối thiểu 2 ký tự')
  .max(SLUG_MAX, `Slug tối đa ${SLUG_MAX} ký tự`)
  .regex(SLUG_REGEX, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang');

const nameSchema = z
  .string({ error: 'Tên không hợp lệ' })
  .trim()
  .min(2, 'Tên tối thiểu 2 ký tự')
  .max(200, 'Tên tối đa 200 ký tự');

const shortDescSchema = z
  .string({ error: 'Mô tả ngắn không hợp lệ' })
  .trim()
  .max(300, 'Mô tả ngắn tối đa 300 ký tự');
const descriptionSchema = z
  .string({ error: 'Mô tả không hợp lệ' })
  .trim()
  .max(20000, 'Mô tả tối đa 20000 ký tự');
const statusSchema = z.enum(PRODUCT_STATUSES, { error: 'Trạng thái không hợp lệ' });
const isFeaturedSchema = z.boolean({ error: 'Giá trị nổi bật không hợp lệ' });

const tagsSchema = z
  .array(
    z
      .string({ error: 'Tag không hợp lệ' })
      .trim()
      .min(1, 'Tag không được để trống')
      .max(30, 'Tag tối đa 30 ký tự')
      .transform((s) => s.toLowerCase()),
    { error: 'Tag không hợp lệ' },
  )
  .max(20, 'Tối đa 20 tag')
  .transform(dedupe);

const enumOrNull = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.enum(values, { error: message }).nullish();

export const coffeeSchema = z.object({
  originCountry: optionalText('Quốc gia', 60),
  originRegion: optionalText('Vùng', 60),
  variety: optionalText('Giống', 60),
  process: enumOrNull(PROCESSES, 'Phương pháp sơ chế không hợp lệ'),
  roastLevel: enumOrNull(ROAST_LEVELS, 'Mức rang không hợp lệ'),
  altitude: intIn('Độ cao', 0, 3000).nullish(),
  tastingNotes: z
    .array(
      z
        .string({ error: 'Hương vị không hợp lệ' })
        .trim()
        .min(1, 'Hương vị không được để trống')
        .max(40, 'Hương vị tối đa 40 ký tự'),
    )
    .max(10, 'Tối đa 10 hương vị')
    .optional(),
  brewMethods: z
    .array(z.enum(BREW_METHODS, { error: 'Cách pha không hợp lệ' }))
    .optional()
    .transform((v) => (v === undefined ? undefined : dedupe(v))),
});
export type CoffeeInput = z.infer<typeof coffeeSchema>;

export const createProductSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  categoryId: idString('categoryId'),
  brandId: idString('brandId')
    .nullish()
    .transform((v) => v ?? null),
  shortDesc: shortDescSchema.default(''),
  description: descriptionSchema.default(''),
  status: statusSchema.default('DRAFT'),
  isFeatured: isFeaturedSchema.default(false),
  tags: tagsSchema.default([]),
  seoTitle: optionalText('SEO title', 120).transform((v) => v ?? null),
  seoDesc: optionalText('SEO description', 300).transform((v) => v ?? null),
  coffee: coffeeSchema.nullish().transform((v) => v ?? null),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    categoryId: idString('categoryId').optional(),
    brandId: idString('brandId').nullish(),
    shortDesc: shortDescSchema.optional(),
    description: descriptionSchema.optional(),
    status: statusSchema.optional(),
    isFeatured: isFeaturedSchema.optional(),
    tags: tagsSchema.optional(),
    seoTitle: optionalText('SEO title', 120),
    seoDesc: optionalText('SEO description', 300),
    coffee: coffeeSchema.nullish(),
  })
  .superRefine(atLeastOne);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuerySchema = z.object({
  q: z
    .string({ error: 'Từ khóa không hợp lệ' })
    .trim()
    .transform((s) => (s === '' ? undefined : s))
    .pipe(z.string().max(100, 'Từ khóa tối đa 100 ký tự').optional())
    .optional(),
  status: csvEnum(PRODUCT_STATUSES, 'Trạng thái không hợp lệ'),
  categoryId: idString('categoryId').optional(),
  brandId: idString('brandId').optional(),
  deleted: z
    .enum(['true', 'false'], { error: 'deleted phải là true hoặc false' })
    .default('false')
    .transform((v) => v === 'true'),
  sort: z.enum(['newest', 'updated', 'name'], { error: 'Sắp xếp không hợp lệ' }).default('newest'),
  ...paginationShape,
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ---------------------------------------------------------------------------
// Biến thể

export interface PricingFields {
  price: number;
  salePrice: number | null;
  saleStart: Date | null;
  saleEnd: Date | null;
}

/** Quy tắc giá/khuyến mãi (dùng cả lúc tạo và lúc cập nhật theo giá trị SAU cập nhật). */
export function checkPricing(v: PricingFields): { field: string; message: string } | null {
  if (v.salePrice !== null && !(v.salePrice > 0 && v.salePrice < v.price)) {
    return { field: 'salePrice', message: 'Giá khuyến mãi phải lớn hơn 0 và nhỏ hơn giá gốc' };
  }
  if (v.saleStart && v.saleEnd && v.saleStart.getTime() >= v.saleEnd.getTime()) {
    return {
      field: 'saleEnd',
      message: 'Thời gian kết thúc khuyến mãi phải sau thời gian bắt đầu',
    };
  }
  return null;
}

const skuSchema = z
  .string({ error: 'SKU không hợp lệ' })
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        SKU_REGEX,
        'SKU gồm 2-40 ký tự A-Z, 0-9 hoặc dấu gạch ngang, bắt đầu bằng chữ hoặc số',
      ),
  );

const variantNameSchema = z
  .string({ error: 'Tên biến thể không hợp lệ' })
  .trim()
  .min(1, 'Tên biến thể không được để trống')
  .max(100, 'Tên biến thể tối đa 100 ký tự');

const attributesSchema = z
  .record(
    z
      .string()
      .trim()
      .min(1, 'Tên thuộc tính không được để trống')
      .max(30, 'Tên thuộc tính tối đa 30 ký tự'),
    z
      .string({ error: 'Giá trị thuộc tính phải là chuỗi' })
      .trim()
      .min(1, 'Giá trị thuộc tính không được để trống')
      .max(50, 'Giá trị thuộc tính tối đa 50 ký tự'),
    { error: 'Thuộc tính không hợp lệ' },
  )
  .refine((o) => Object.keys(o).length <= 10, 'Tối đa 10 thuộc tính');

const priceSchema = intIn('Giá', 1, 100_000_000);
const salePriceSchema = z
  .number({ error: 'Giá khuyến mãi phải là số nguyên' })
  .int('Giá khuyến mãi phải là số nguyên')
  .nullish();
const dateTimeSchema = z.iso
  .datetime({ offset: true, error: 'Thời gian không hợp lệ (ISO 8601)' })
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));
const roastDateSchema = dateOnly('Ngày rang')
  .nullish()
  .transform((v) =>
    v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00.000Z`),
  );
const lowStockSchema = intIn('Ngưỡng sắp hết', 0, 1000);
const weightSchema = intIn('Khối lượng', 0, 100_000);
const sortOrderSchema = intIn('Thứ tự', 0, 9999);
const isActiveSchema = z.boolean({ error: 'Trạng thái không hợp lệ' });

export const createVariantSchema = z
  .object({
    sku: skuSchema,
    name: variantNameSchema,
    attributes: attributesSchema.default({}),
    price: priceSchema,
    salePrice: salePriceSchema.transform((v) => v ?? null),
    saleStart: dateTimeSchema.transform((v) => v ?? null),
    saleEnd: dateTimeSchema.transform((v) => v ?? null),
    stock: intIn('Tồn kho', 0, 100_000).default(0),
    lowStockThreshold: lowStockSchema.default(5),
    weightGram: weightSchema.default(0),
    roastDate: roastDateSchema.transform((v) => v ?? null),
    sortOrder: sortOrderSchema.default(0),
    isActive: isActiveSchema.default(true),
  })
  .superRefine((v, ctx) => {
    const err = checkPricing(v);
    if (err) ctx.addIssue({ code: 'custom', path: [err.field], message: err.message });
  });
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

/** Không có `stock`: trường lạ bị zod bỏ qua (đổi tồn dùng §12.2). */
export const updateVariantSchema = z
  .object({
    sku: skuSchema.optional(),
    name: variantNameSchema.optional(),
    attributes: attributesSchema.optional(),
    price: priceSchema.optional(),
    salePrice: salePriceSchema,
    saleStart: dateTimeSchema,
    saleEnd: dateTimeSchema,
    lowStockThreshold: lowStockSchema.optional(),
    weightGram: weightSchema.optional(),
    roastDate: roastDateSchema,
    sortOrder: sortOrderSchema.optional(),
    isActive: isActiveSchema.optional(),
  })
  .superRefine(atLeastOne);
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ---------------------------------------------------------------------------
// Ảnh

export const createImageSchema = z.object({
  url: imageUrlSchema,
  alt: z
    .string({ error: 'Mô tả ảnh không hợp lệ' })
    .trim()
    .max(200, 'Mô tả ảnh tối đa 200 ký tự')
    .default(''),
  isPrimary: z.boolean({ error: 'isPrimary không hợp lệ' }).optional(),
});
export type CreateImageInput = z.infer<typeof createImageSchema>;

export const updateImageSchema = z
  .object({
    alt: z
      .string({ error: 'Mô tả ảnh không hợp lệ' })
      .trim()
      .max(200, 'Mô tả ảnh tối đa 200 ký tự')
      .optional(),
    isPrimary: z.literal(true, { error: 'isPrimary chỉ nhận giá trị true' }).optional(),
  })
  .superRefine(atLeastOne);
export type UpdateImageInput = z.infer<typeof updateImageSchema>;

export const reorderImagesSchema = z.object({
  imageIds: z
    .array(idString('imageIds'), { error: 'imageIds phải là mảng' })
    .max(10, 'Tối đa 10 ảnh'),
});
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
