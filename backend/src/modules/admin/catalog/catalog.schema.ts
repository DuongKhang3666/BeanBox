import { z } from 'zod';
import { SLUG_MAX, SLUG_REGEX } from '../../../lib/slug.js';
import { idString, imageUrlSchema } from '../admin.schema.js';

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
  .max(100, 'Tên tối đa 100 ký tự');

/** undefined = không gửi; '' hoặc null = xóa giá trị (null). */
const nullableDescription = z
  .string({ error: 'Mô tả không hợp lệ' })
  .trim()
  .max(1000, 'Mô tả tối đa 1000 ký tự')
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : v));

const sortOrderSchema = z
  .number({ error: 'Thứ tự phải là số nguyên' })
  .int('Thứ tự phải là số nguyên')
  .min(0, 'Thứ tự phải từ 0 đến 9999')
  .max(9999, 'Thứ tự phải từ 0 đến 9999');

const parentIdSchema = idString('parentId').nullish();

export const createCategorySchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  parentId: parentIdSchema.transform((v) => v ?? null),
  description: nullableDescription,
  imageUrl: imageUrlSchema.nullish().transform((v) => v ?? null),
  sortOrder: sortOrderSchema.default(0),
  isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

const atLeastOne = (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
  if (!Object.values(v).some((x) => x !== undefined)) {
    ctx.addIssue({ code: 'custom', path: [], message: 'Cần ít nhất một trường để cập nhật' });
  }
};

export const updateCategorySchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    parentId: parentIdSchema,
    description: nullableDescription,
    imageUrl: imageUrlSchema.nullish(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
  })
  .superRefine(atLeastOne);
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createBrandSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  logoUrl: imageUrlSchema.nullish().transform((v) => v ?? null),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    logoUrl: imageUrlSchema.nullish(),
  })
  .superRefine(atLeastOne);
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
