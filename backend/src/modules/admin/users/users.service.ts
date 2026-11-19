import type { Prisma, Role, UserStatus } from '../../../generated/prisma/client.js';
import { writeAudit, type AuditDiff } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike } from '../../../lib/text.js';
import { ID_REGEX } from '../admin.schema.js';
import { toUserItem, USER_SELECT, type AdminUserItem } from './users.dto.js';
import type { ListUsersQuery } from './users.schema.js';

/** Quản lý người dùng (api-contract §14.10, D-022). */

export interface Actor {
  userId: string;
  ip: string | undefined;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');

export function buildUsersWhere(q: ListUsersQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (q.role) where.role = { in: q.role };
  if (q.status) where.status = { in: q.status };
  if (q.q) {
    const s = escapeLike(q.q);
    where.OR = [
      { email: { contains: s, mode: 'insensitive' } },
      { fullName: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
    ];
  }
  return where;
}

function orderByOf(sort: ListUsersQuery['sort']): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'lastLogin':
      return [
        { lastLoginAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

export async function listUsers(q: ListUsersQuery) {
  const where = buildUsersWhere(q);
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: orderByOf(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    data: rows.map(toUserItem),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

export interface AdminUserDetail extends AdminUserItem {
  addressCount: number;
  orders: {
    count: number;
    paidTotal: number;
    recent: Array<{ code: string; status: string; grandTotal: number; createdAt: string }>;
  };
  activeSessions: number;
}

async function loadDetail(
  db: Prisma.TransactionClient | typeof prisma,
  id: string,
): Promise<AdminUserDetail> {
  const user = await db.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) throw notFound();
  const now = new Date();
  const [addressCount, paid, recent, activeSessions] = await Promise.all([
    db.address.count({ where: { userId: id } }),
    db.order.aggregate({
      where: {
        userId: id,
        paymentStatus: 'PAID',
        status: { notIn: ['CANCELLED', 'RETURNED'] },
      },
      _sum: { grandTotal: true },
    }),
    db.order.findMany({
      where: { userId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: { code: true, status: true, grandTotal: true, createdAt: true },
    }),
    db.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
  ]);
  const item = toUserItem(user);
  return {
    ...item,
    addressCount,
    orders: {
      count: item.orderCount,
      paidTotal: paid._sum.grandTotal ?? 0,
      recent: recent.map((o) => ({
        code: o.code,
        status: o.status,
        grandTotal: o.grandTotal,
        createdAt: o.createdAt.toISOString(),
      })),
    },
    activeSessions,
  };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  if (!ID_REGEX.test(id)) throw notFound();
  return loadDetail(prisma, id);
}

interface LockedRow {
  id: string;
  role: Role;
  status: UserStatus;
}

/**
 * Bước chung của 2 PATCH: 404 -> CANNOT_MODIFY_SELF -> khóa dòng -> 403 người thao tác ->
 * trả trạng thái đích SAU khi khóa và số ADMIN ACTIVE khác đích.
 */
async function lockAndCheck(tx: Prisma.TransactionClient, targetId: string, actor: Actor) {
  const exists = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!exists) throw notFound();
  if (targetId === actor.userId) {
    throw new AppError(
      409,
      'CANNOT_MODIFY_SELF',
      'Bạn không thể khóa hoặc đổi vai trò của chính mình',
    );
  }
  // Khóa theo thứ tự id (tránh deadlock). Đọc lại role/status SAU khi khóa.
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT "id", "role", "status" FROM "User"
    WHERE ("role" = 'ADMIN' AND "status" = 'ACTIVE') OR "id" IN (${actor.userId}, ${targetId})
    ORDER BY "id" FOR UPDATE`;
  const me = rows.find((r) => r.id === actor.userId);
  if (!me || me.role !== 'ADMIN' || me.status !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
  }
  const target = rows.find((r) => r.id === targetId);
  if (!target) throw notFound();
  const otherActiveAdmins = rows.filter(
    (r) => r.id !== targetId && r.role === 'ADMIN' && r.status === 'ACTIVE',
  ).length;
  return { target, otherActiveAdmins };
}

const lastAdmin = () =>
  new AppError(409, 'LAST_ADMIN', 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');

export async function updateUserStatus(
  id: string,
  input: { status: UserStatus; reason?: string | undefined },
  actor: Actor,
): Promise<AdminUserDetail> {
  if (!ID_REGEX.test(id)) throw notFound();
  return prisma.$transaction(async (tx) => {
    const { target, otherActiveAdmins } = await lockAndCheck(tx, id, actor);
    const now = new Date();

    const loses =
      target.role === 'ADMIN' && target.status === 'ACTIVE' && input.status === 'DISABLED';
    if (loses && otherActiveAdmins === 0) throw lastAdmin();

    if (target.status === input.status) {
      // No-op, trừ mở khóa tạm thời.
      if (input.status === 'ACTIVE') {
        const cur = await tx.user.findUniqueOrThrow({
          where: { id },
          select: { lockedUntil: true },
        });
        if (cur.lockedUntil && cur.lockedUntil > now) {
          await tx.user.update({
            where: { id },
            data: { failedLoginCount: 0, lockedUntil: null },
          });
          await writeAudit(tx, {
            actorId: actor.userId,
            action: 'user.status',
            entity: 'User',
            entityId: id,
            diff: { lockedUntil: [cur.lockedUntil.toISOString(), null] },
            ip: actor.ip ?? null,
          });
        }
      }
      return loadDetail(tx, id);
    }

    if (input.status === 'DISABLED') {
      await tx.user.update({ where: { id }, data: { status: 'DISABLED' } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
    } else {
      await tx.user.update({
        where: { id },
        data: { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
      });
    }
    const diff: AuditDiff = { status: [target.status, input.status] };
    if (input.reason) diff.reason = [null, input.reason];
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'user.status',
      entity: 'User',
      entityId: id,
      diff,
      ip: actor.ip ?? null,
    });
    return loadDetail(tx, id);
  });
}

export async function updateUserRole(
  id: string,
  role: Role,
  actor: Actor,
): Promise<AdminUserDetail> {
  if (!ID_REGEX.test(id)) throw notFound();
  return prisma.$transaction(async (tx) => {
    const { target, otherActiveAdmins } = await lockAndCheck(tx, id, actor);

    const loses = target.role === 'ADMIN' && target.status === 'ACTIVE' && role !== 'ADMIN';
    if (loses && otherActiveAdmins === 0) throw lastAdmin();

    if (target.role === role) return loadDetail(tx, id);

    await tx.user.update({ where: { id }, data: { role } });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'user.role',
      entity: 'User',
      entityId: id,
      diff: { role: [target.role, role] },
      ip: actor.ip ?? null,
    });
    return loadDetail(tx, id);
  });
}
