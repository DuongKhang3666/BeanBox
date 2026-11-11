import { z } from 'zod';
import { csvEnum, idString, paginationShape } from '../admin.schema.js';

export const COUPON_TYPES = ['PERCENT', 'FIXED', 'FREESHIP'] as const;
export const COUPON_STATES = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'INACTIVE', 'EXHAUSTED'] as const;
export type CouponStateName = (typeof COUPON_STATES)[number];

export const MAX_FIXED_VALUE = 100_000_000;
export const MAX_MIN_ORDER = 1_000_000_000;
const MAX_INT = 2_000_000_000;
const SCOPE_MAX = 50;

export const listCouponsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(50, 'Từ khóa tối đa 50 ký tự')
    .optional()
    .transform((v) => (v ? v : undefined)),
  type: csvEnum(COUPON_TYPES, 'Loại mã không hợp lệ'),
  state: z.enum(COUPON_STATES, { error: 'Trạng thái mã không hợp lệ' }).optional(),
  ...paginationShape,
});
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>;

const intIn = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} phải là số nguyên` })
    .int(`${label} phải là số nguyên`)
    .min(min, `${label} phải từ ${min} đến ${max}`)
    .max(max, `${label} phải từ ${min} đến ${max}`);

const codeSchema = z
  .string({ error: 'Mã không hợp lệ' })
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z.string().regex(/^[A-Z0-9_-]{3,30}$/, 'Mã gồm 3-30 ký tự: chữ, số, gạch ngang, gạch dưới'),
  );

const dateTimeSchema = z.iso
  .datetime({ offset: true, error: 'Thời gian không hợp lệ (ISO 8601)' })
  .transform((v) => new Date(v));

const limitSchema = intIn('Giới hạn', 1, MAX_INT);

const scopeSchema = z.object({
  categoryIds: z
    .array(idString('Danh mục'), { error: 'Danh sách danh mục không hợp lệ' })
    .max(SCOPE_MAX, `Tối đa ${SCOPE_MAX} danh mục`)
    .optional(),
  productIds: z
    .array(idString('Sản phẩm'), { error: 'Danh sách sản phẩm không hợp lệ' })
    .max(SCOPE_MAX, `Tối đa ${SCOPE_MAX} sản phẩm`)
    .optional(),
});

const descriptionSchema = z
  .string({ error: 'Mô tả không hợp lệ' })
  .trim()
  .max(200, 'Mô tả tối đa 200 ký tự');

export interface CouponShape {
  type: (typeof COUPON_TYPES)[number];
  value: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}
export interface ShapeIssue {
  field: string;
  message: string;
}

/** Ràng buộc chéo (theo giá trị đầy đủ): dùng cho POST và cho PATCH sau khi gộp. */
export function checkCouponShape(c: CouponShape): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  if (c.type === 'PERCENT' && (c.value < 1 || c.value > 100)) {
    issues.push({ field: 'value', message: 'Phần trăm giảm phải từ 1 đến 100' });
  }
  if (c.type === 'FIXED' && (c.value < 1 || c.value > MAX_FIXED_VALUE)) {
    issues.push({ field: 'value', message: 'Số tiền giảm phải từ 1 đến 100.000.000' });
  }
  if (c.type === 'FREESHIP' && c.value !== 0) {
    issues.push({ field: 'value', message: 'Mã miễn phí vận chuyển phải có giá trị 0' });
  }
  if (c.type === 'FIXED' && c.maxDiscount !== null) {
    issues.push({
      field: 'maxDiscount',
      message: 'Mã giảm số tiền cố định không có mức giảm tối đa',
    });
  }
  if (c.startsAt && c.endsAt && c.startsAt.getTime() >= c.endsAt.getTime()) {
    issues.push({ field: 'endsAt', message: 'Thời gian kết thúc phải sau thời gian bắt đầu' });
  }
  return issues;
}

const addIssues = (issues: ShapeIssue[], ctx: z.RefinementCtx) => {
  for (const i of issues) ctx.addIssue({ code: 'custom', path: [i.field], message: i.message });
};

export const createCouponSchema = z
  .object({
    code: codeSchema,
    type: z.enum(COUPON_TYPES, { error: 'Loại mã không hợp lệ' }),
    value: intIn('Giá trị', 0, MAX_INT).optional(),
    maxDiscount: intIn('Mức giảm tối đa', 1, MAX_INT).nullish(),
    minOrder: intIn('Đơn tối thiểu', 0, MAX_MIN_ORDER).default(0),
    startsAt: dateTimeSchema.nullish(),
    endsAt: dateTimeSchema.nullish(),
    usageLimit: limitSchema.nullish(),
    perUserLimit: limitSchema.nullish(),
    scope: scopeSchema.nullish(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).default(true),
    description: descriptionSchema.nullish(),
  })
  .transform((v, ctx) => {
    const out = {
      code: v.code,
      type: v.type,
      value: v.value ?? (v.type === 'FREESHIP' ? 0 : undefined),
      maxDiscount: v.maxDiscount ?? null,
      minOrder: v.minOrder,
      startsAt: v.startsAt ?? null,
      endsAt: v.endsAt ?? null,
      usageLimit: v.usageLimit ?? null,
      perUserLimit: v.perUserLimit ?? null,
      scope: v.scope ?? null,
      isActive: v.isActive,
      description: v.description ? v.description : null,
    };
    if (out.value === undefined) {
      addIssues([{ field: 'value', message: 'Vui lòng nhập giá trị giảm' }], ctx);
      return z.NEVER;
    }
    addIssues(checkCouponShape({ ...out, value: out.value }), ctx);
    return { ...out, value: out.value };
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

const forbidden = (message: string) =>
  z
    .unknown()
    .optional()
    .refine((v) => v === undefined, message);

export const updateCouponSchema = z
  .object({
    // Gửi code/type -> 400 (api-contract §13.8: không đổi được).
    code: forbidden('Không thể đổi mã'),
    type: forbidden('Không thể đổi loại mã'),
    value: intIn('Giá trị', 0, MAX_INT).optional(),
    maxDiscount: intIn('Mức giảm tối đa', 1, MAX_INT).nullish(),
    minOrder: intIn('Đơn tối thiểu', 0, MAX_MIN_ORDER).optional(),
    startsAt: dateTimeSchema.nullish(),
    endsAt: dateTimeSchema.nullish(),
    usageLimit: limitSchema.nullish(),
    perUserLimit: limitSchema.nullish(),
    scope: scopeSchema.nullish(),
    isActive: z.boolean({ error: 'Trạng thái không hợp lệ' }).optional(),
    description: descriptionSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    const changed = Object.entries(v).some(
      ([k, x]) => k !== 'code' && k !== 'type' && x !== undefined,
    );
    if (!changed) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Cần ít nhất một trường để cập nhật' });
    }
  });
export type UpdateCouponInput = Omit<z.infer<typeof updateCouponSchema>, 'code' | 'type'>;
