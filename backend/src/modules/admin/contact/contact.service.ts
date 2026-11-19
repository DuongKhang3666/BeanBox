import type { ContactStatus, Prisma } from '@prisma/client';
import { writeAudit, type AuditDiff } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike } from '../../../lib/text.js';
import { ID_REGEX } from '../admin.schema.js';
import type { ListContactQuery, UpdateContactInput } from './contact.schema.js';

/** Quản lý tin nhắn liên hệ (api-contract §14.11, D-023). */

const SELECT = {
  id: true,
  userId: true,
  name: true,
  email: true,
  phone: true,
  subject: true,
  message: true,
  status: true,
  adminNote: true,
  handledAt: true,
  createdAt: true,
  updatedAt: true,
  handledBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ContactMessageSelect;

type Row = Prisma.ContactMessageGetPayload<{ select: typeof SELECT }>;

export interface AdminContactItem {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactStatus;
  adminNote: string | null;
  handledBy: { id: string; fullName: string } | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toItem(r: Row): AdminContactItem {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    subject: r.subject,
    message: r.message,
    status: r.status,
    adminNote: r.adminNote,
    handledBy: r.handledBy,
    handledAt: r.handledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy tin nhắn liên hệ');

export function buildContactWhere(q: ListContactQuery): Prisma.ContactMessageWhereInput {
  const where: Prisma.ContactMessageWhereInput = {};
  if (q.status) where.status = { in: q.status };
  if (q.q) {
    const s = escapeLike(q.q);
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { subject: { contains: s, mode: 'insensitive' } },
      { message: { contains: s, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listContactMessages(q: ListContactQuery) {
  const where = buildContactWhere(q);
  const [total, rows] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    data: rows.map(toItem),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

async function load(
  db: Prisma.TransactionClient | typeof prisma,
  id: string,
): Promise<AdminContactItem> {
  const row = await db.contactMessage.findUnique({ where: { id }, select: SELECT });
  if (!row) throw notFound();
  return toItem(row);
}

export async function getContactMessage(id: string): Promise<AdminContactItem> {
  if (!ID_REGEX.test(id)) throw notFound();
  return load(prisma, id);
}

export async function updateContactMessage(
  id: string,
  input: UpdateContactInput,
  actor: { userId: string; ip: string | undefined },
): Promise<AdminContactItem> {
  if (!ID_REGEX.test(id)) throw notFound();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ status: ContactStatus; adminNote: string | null }>
    >`SELECT "status", "adminNote" FROM "ContactMessage" WHERE "id" = ${id} FOR UPDATE`;
    const cur = locked[0];
    if (!cur) throw notFound();

    const data: Prisma.ContactMessageUncheckedUpdateInput = {};
    const diff: AuditDiff = {};
    if (input.status !== undefined && input.status !== cur.status) {
      data.status = input.status;
      data.handledById = actor.userId;
      data.handledAt = new Date();
      diff.status = [cur.status, input.status];
    }
    if (input.adminNote !== undefined && input.adminNote !== cur.adminNote) {
      data.adminNote = input.adminNote;
      // Không chép nội dung ghi chú vào audit.
      diff.adminNote = [null, 'đã cập nhật'];
    }
    if (Object.keys(diff).length === 0) return load(tx, id);

    await tx.contactMessage.update({ where: { id }, data, select: { id: true } });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'contact.update',
      entity: 'ContactMessage',
      entityId: id,
      diff,
      ip: actor.ip ?? null,
    });
    return load(tx, id);
  });
}
