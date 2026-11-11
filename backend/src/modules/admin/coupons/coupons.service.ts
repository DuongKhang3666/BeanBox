import { Prisma, type Coupon } from '@prisma/client';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike } from '../../../lib/text.js';
import { ID_REGEX } from '../admin.schema.js';
import { toAdminCoupon, type AdminCouponDto } from './coupons.dto.js';
import {
  checkCouponShape,
  type CouponStateName,
  type CreateCouponInput,
  type ListCouponsQuery,
  type UpdateCouponInput,
} from './coupons.schema.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface Actor {
  actorId: string;
  ip: string | null;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy mã giảm giá');
const validationError = (issues: Array<{ field: string; message: string }>) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', issues);

const AUDIT_KEYS = [
  'code',
  'type',
  'value',
  'maxDiscount',
  'minOrder',
  'startsAt',
  'endsAt',
  'usageLimit',
  'perUserLimit',
  'scope',
  'isActive',
  'description',
] as const;

type ScopeInput = { categoryIds?: string[] | undefined; productIds?: string[] | undefined };
interface NormalizedScope {
  categoryIds: string[];
  productIds: string[];
}

/** Bỏ trùng; cả hai mảng rỗng -> null (áp dụng toàn bộ). */
function normalizeScope(scope: ScopeInput | null | undefined): NormalizedScope | null {
  if (!scope) return null;
  const categoryIds = [...new Set(scope.categoryIds ?? [])];
  const productIds = [...new Set(scope.productIds ?? [])];
  return categoryIds.length === 0 && productIds.length === 0 ? null : { categoryIds, productIds };
}

async function assertScopeExists(
  tx: Prisma.TransactionClient,
  scope: NormalizedScope | null,
): Promise<void> {
  if (!scope) return;
  const issues: Array<{ field: string; message: string }> = [];
  if (scope.categoryIds.length > 0) {
    const found = await tx.category.count({ where: { id: { in: scope.categoryIds } } });
    if (found !== scope.categoryIds.length) {
      issues.push({ field: 'scope.categoryIds', message: 'Có danh mục không tồn tại' });
    }
  }
  if (scope.productIds.length > 0) {
    const found = await tx.product.count({
      where: { id: { in: scope.productIds }, deletedAt: null },
    });
    if (found !== scope.productIds.length) {
      issues.push({ field: 'scope.productIds', message: 'Có sản phẩm không tồn tại' });
    }
  }
  if (issues.length > 0) throw validationError(issues);
}

const scopeValue = (scope: NormalizedScope | null) =>
  scope === null ? Prisma.DbNull : (scope as unknown as Prisma.InputJsonValue);

/** Dạng so sánh/audit của một Coupon (scope chuẩn hóa). */
function auditView(c: Coupon): Record<string, unknown> {
  return { ...c, scope: normalizeScope(c.scope as ScopeInput | null) };
}

// ---------------------------------------------------------------------------
// Danh sách / chi tiết

/** Điều kiện DB tương đương `couponState` (cùng thứ tự ưu tiên). */
function stateWhere(state: CouponStateName, now: Date): Prisma.CouponWhereInput {
  const exhausted: Prisma.CouponWhereInput = {
    usageLimit: { not: null },
    usedCount: { gte: prisma.coupon.fields.usageLimit },
  };
  const active: Prisma.CouponWhereInput = { isActive: true, NOT: exhausted };
  const notExpired: Prisma.CouponWhereInput = { OR: [{ endsAt: null }, { endsAt: { gte: now } }] };
  switch (state) {
    case 'INACTIVE':
      return { isActive: false };
    case 'EXHAUSTED':
      return { isActive: true, ...exhausted };
    case 'EXPIRED':
      return { ...active, endsAt: { lt: now } };
    case 'SCHEDULED':
      return { ...active, AND: [notExpired], startsAt: { gt: now } };
    case 'ACTIVE':
      return {
        ...active,
        AND: [notExpired, { OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
      };
  }
}

export async function listCoupons(q: ListCouponsQuery) {
  const now = new Date();
  const and: Prisma.CouponWhereInput[] = [];
  if (q.q) and.push({ code: { contains: escapeLike(q.q), mode: 'insensitive' } });
  if (q.type) and.push({ type: { in: q.type as Array<'PERCENT' | 'FIXED' | 'FREESHIP'> } });
  if (q.state) and.push(stateWhere(q.state, now));
  const where: Prisma.CouponWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    data: rows.map((r) => toAdminCoupon(r, now)),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

export async function getCoupon(id: string): Promise<AdminCouponDto> {
  if (!ID_REGEX.test(id)) throw notFound();
  const row = await prisma.coupon.findUnique({ where: { id } });
  if (!row) throw notFound();
  return toAdminCoupon(row);
}

// ---------------------------------------------------------------------------
// Tạo

export async function createCoupon(
  input: CreateCouponInput,
  { actorId, ip }: Actor,
): Promise<AdminCouponDto> {
  const scope = normalizeScope(input.scope);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertScopeExists(tx, scope);
      const row = await tx.coupon.create({
        data: {
          code: input.code,
          type: input.type,
          value: input.value,
          maxDiscount: input.maxDiscount,
          minOrder: input.minOrder,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          usageLimit: input.usageLimit,
          perUserLimit: input.perUserLimit,
          scope: scopeValue(scope),
          isActive: input.isActive,
          description: input.description,
        },
      });
      const nulls = Object.fromEntries(AUDIT_KEYS.map((k) => [k, null]));
      await writeAudit(tx, {
        actorId,
        action: 'coupon.create',
        entity: 'Coupon',
        entityId: row.id,
        diff: diffFields(nulls, auditView(row), AUDIT_KEYS),
        ip,
      });
      return toAdminCoupon(row);
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'COUPON_CODE_TAKEN', 'Mã giảm giá đã tồn tại', { field: 'code' });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Cập nhật

async function lockCoupon(tx: Prisma.TransactionClient, id: string): Promise<Coupon> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`;
  if (locked.length === 0) throw notFound();
  return tx.coupon.findUniqueOrThrow({ where: { id } });
}

export async function updateCoupon(
  id: string,
  input: UpdateCouponInput,
  { actorId, ip }: Actor,
): Promise<AdminCouponDto> {
  if (!ID_REGEX.test(id)) throw notFound();
  return prisma.$transaction(async (tx) => {
    // Khóa dòng: usedCount không đổi trong lúc kiểm usageLimit.
    const before = await lockCoupon(tx, id);

    const merged = {
      value: input.value ?? before.value,
      maxDiscount: input.maxDiscount === undefined ? before.maxDiscount : input.maxDiscount,
      startsAt: input.startsAt === undefined ? before.startsAt : input.startsAt,
      endsAt: input.endsAt === undefined ? before.endsAt : input.endsAt,
      usageLimit: input.usageLimit === undefined ? before.usageLimit : input.usageLimit,
    };
    const issues = checkCouponShape({ type: before.type, ...merged });
    if (merged.usageLimit !== null && merged.usageLimit < before.usedCount) {
      issues.push({
        field: 'usageLimit',
        message: `Giới hạn lượt dùng không được nhỏ hơn số lượt đã dùng (${before.usedCount})`,
      });
    }
    if (issues.length > 0) throw validationError(issues);

    const data: Prisma.CouponUpdateInput = {};
    if (input.value !== undefined) data.value = input.value;
    if (input.maxDiscount !== undefined) data.maxDiscount = input.maxDiscount;
    if (input.minOrder !== undefined) data.minOrder = input.minOrder;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt;
    if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.scope !== undefined) {
      const scope = normalizeScope(input.scope);
      await assertScopeExists(tx, scope);
      data.scope = scopeValue(scope);
    }

    const row = await tx.coupon.update({ where: { id }, data });
    await writeAudit(tx, {
      actorId,
      action: 'coupon.update',
      entity: 'Coupon',
      entityId: id,
      diff: diffFields(auditView(before), auditView(row), AUDIT_KEYS),
      ip,
    });
    return toAdminCoupon(row);
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Xóa

const usedConflict = () => new AppError(409, 'CONFLICT', 'Mã đã được dùng, hãy tắt mã thay vì xóa');

export async function deleteCoupon(id: string, { actorId, ip }: Actor): Promise<void> {
  if (!ID_REGEX.test(id)) throw notFound();
  try {
    await prisma.$transaction(async (tx) => {
      const before = await lockCoupon(tx, id);
      const [redemptions, orders] = await Promise.all([
        tx.couponRedemption.count({ where: { couponId: id } }),
        tx.order.count({ where: { couponId: id } }),
      ]);
      if (redemptions > 0 || orders > 0) throw usedConflict();

      await tx.coupon.delete({ where: { id } });
      const nulls = Object.fromEntries(AUDIT_KEYS.map((k) => [k, null]));
      await writeAudit(tx, {
        actorId,
        action: 'coupon.delete',
        entity: 'Coupon',
        entityId: id,
        diff: diffFields(auditView(before), nulls, AUDIT_KEYS),
        ip,
      });
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw usedConflict();
    }
    throw e;
  }
}
