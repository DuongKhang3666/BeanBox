import { z } from 'zod';

export const ROAST_LEVELS = ['LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK'] as const;
export const COFFEE_PROCESSES = ['WASHED', 'NATURAL', 'HONEY', 'ANAEROBIC', 'OTHER'] as const;
export const BREW_METHODS = [
  'PHIN',
  'ESPRESSO',
  'POUR_OVER',
  'COLD_BREW',
  'FRENCH_PRESS',
  'AEROPRESS',
  'MOKA',
] as const;
export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'bestseller',
  'rating',
  'relevance',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRICE = 2_000_000_000; // vừa trong Int32 của Postgres
const MAX_PAGE = 1_000_000;
const MAX_LIST_ITEMS = 30;

/** Express gộp tham số lặp thành mảng: `brand=a&brand=b` coi như `a,b`. */
const joinRepeated = (v: unknown) => (Array.isArray(v) ? v.join(',') : v);

function csv<T extends string>(item: z.ZodType<T, string>) {
  return z.preprocess(
    joinRepeated,
    z
      .string()
      .transform((s) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x.length > 0),
      )
      .pipe(z.array(item).max(MAX_LIST_ITEMS))
      .transform((arr) => (arr.length > 0 ? [...new Set(arr)] : undefined)),
  );
}

const intParam = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `${label} phải từ ${min} đến ${max}`)
        .max(max, `${label} phải từ ${min} đến ${max}`),
    );

const trueFlag = z
  .literal('true', { error: 'Chỉ chấp nhận giá trị true' })
  .transform(() => true as const);

export const productListQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1, 'Từ khóa không được để trống')
      .max(100, 'Từ khóa tối đa 100 ký tự')
      .optional(),
    category: z.string().trim().min(1).max(100).optional(),
    brand: csv(z.string().max(100)).optional(),
    minPrice: intParam(0, MAX_PRICE, 'minPrice').optional(),
    maxPrice: intParam(0, MAX_PRICE, 'maxPrice').optional(),
    inStock: trueFlag.optional(),
    origin: csv(z.string().max(100)).optional(),
    roast: csv(z.enum(ROAST_LEVELS, { error: 'Mức rang không hợp lệ' })).optional(),
    process: csv(z.enum(COFFEE_PROCESSES, { error: 'Cách sơ chế không hợp lệ' })).optional(),
    brew: csv(z.enum(BREW_METHODS, { error: 'Cách pha không hợp lệ' })).optional(),
    featured: trueFlag.optional(),
    sort: z.enum(PRODUCT_SORTS, { error: 'Cách sắp xếp không hợp lệ' }).optional(),
    page: intParam(1, MAX_PAGE, 'page').default(1),
    pageSize: intParam(1, 100, 'pageSize').default(20),
  })
  .superRefine((v, ctx) => {
    if (v.minPrice !== undefined && v.maxPrice !== undefined && v.minPrice > v.maxPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['minPrice'],
        message: 'minPrice không được lớn hơn maxPrice',
      });
    }
    if (v.sort === 'relevance' && v.q === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'sort=relevance chỉ dùng được khi có từ khóa tìm kiếm (q)',
      });
    }
  })
  .transform((v) => ({ ...v, sort: v.sort ?? (v.q !== undefined ? 'relevance' : 'newest') }));

export type ProductListQuery = z.output<typeof productListQuerySchema>;

export const suggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Từ khóa phải từ 2 đến 50 ký tự')
    .max(50, 'Từ khóa phải từ 2 đến 50 ký tự'),
  limit: intParam(1, 10, 'limit').default(6),
});

export type SuggestQuery = z.output<typeof suggestQuerySchema>;

export const slugSchema = z.string().max(200).regex(SLUG_REGEX);
