import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike } from '../../../lib/text.js';
import { vnDayEnd, vnDayStart } from '../admin.schema.js';
import type { AuditLogsQuery } from './audit.schema.js';

/** Nhật ký thao tác (api-contract §14.4, D-019). */

export function buildAuditWhere(q: AuditLogsQuery): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  // `action` và `actionPrefix` dùng cùng nhau thì lấy hợp.
  const actionClauses: Prisma.AuditLogWhereInput[] = [];
  if (q.action) actionClauses.push({ action: { in: q.action } });
  if (q.actionPrefix) actionClauses.push({ action: { startsWith: escapeLike(q.actionPrefix) } });
  if (actionClauses.length > 0) where.OR = actionClauses;
  if (q.entity) where.entity = q.entity;
  if (q.entityId) where.entityId = q.entityId;
  if (q.actorId) where.actorId = q.actorId;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: vnDayStart(q.from) } : {}),
      ...(q.to ? { lte: vnDayEnd(q.to) } : {}),
    };
  }
  return where;
}

export async function listAuditLogs(q: AuditLogsQuery) {
  const where = buildAuditWhere(q);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      diff: r.diff,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      actor: r.actor
        ? { id: r.actor.id, fullName: r.actor.fullName, email: r.actor.email, role: r.actor.role }
        : null,
    })),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}
