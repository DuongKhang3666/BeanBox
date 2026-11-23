import { writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { normalizeOrderCode, ORDER_CODE_REGEX } from '../../../lib/orderCode.js';
import type { OrderActor } from '../../../lib/orderStateMachine.js';
import { prisma } from '../../../lib/prisma.js';
import { ID_REGEX } from '../admin.schema.js';
import {
  adminOrderInclude,
  orderNoteSelect,
  toAdminOrderDto,
  toOrderNoteDto,
  type AdminOrderDto,
  type OrderNoteDto,
} from './orders.dto.js';
import type { AddOrderNoteInput } from './orders.schema.js';

/** D-071 (ghi chú nội bộ, append-only) và D-072 (dữ liệu in hàng loạt). */

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
const noteNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy ghi chú');

async function orderIdOf(rawCode: string): Promise<string> {
  const code = normalizeOrderCode(rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();
  const o = await prisma.order.findUnique({ where: { code }, select: { id: true } });
  if (!o) throw notFound();
  return o.id;
}

export async function listNotes(rawCode: string): Promise<OrderNoteDto[]> {
  const orderId = await orderIdOf(rawCode);
  const rows = await prisma.orderNote.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: orderNoteSelect,
  });
  return rows.map(toOrderNoteDto);
}

export async function addNote(args: {
  rawCode: string;
  input: AddOrderNoteInput;
  actorId: string;
  ip: string | null;
}): Promise<OrderNoteDto> {
  const orderId = await orderIdOf(args.rawCode);
  return prisma.$transaction(async (tx) => {
    const row = await tx.orderNote.create({
      data: { orderId, authorId: args.actorId, body: args.input.body },
      select: orderNoteSelect,
    });
    // Audit chỉ ghi id và độ dài, không ghi nội dung ghi chú.
    await writeAudit(tx, {
      actorId: args.actorId,
      action: 'order.note.create',
      entity: 'Order',
      entityId: orderId,
      diff: { noteId: [null, row.id], length: [null, args.input.body.length] },
      ip: args.ip,
    });
    return toOrderNoteDto(row);
  });
}

export async function deleteNote(args: {
  rawCode: string;
  noteId: string;
  actorId: string;
  ip: string | null;
}): Promise<void> {
  const orderId = await orderIdOf(args.rawCode);
  if (!ID_REGEX.test(args.noteId)) throw noteNotFound();
  await prisma.$transaction(async (tx) => {
    const note = await tx.orderNote.findFirst({
      where: { id: args.noteId, orderId },
      select: { id: true, body: true },
    });
    if (!note) throw noteNotFound();
    await tx.orderNote.delete({ where: { id: note.id } });
    await writeAudit(tx, {
      actorId: args.actorId,
      action: 'order.note.delete',
      entity: 'Order',
      entityId: orderId,
      diff: { noteId: [note.id, null], length: [note.body.length, null] },
      ip: args.ip,
    });
  });
}

/**
 * Dữ liệu phiếu in nhiều đơn: một `findMany` (kèm include) thay vì N lần `findUnique`.
 * Mã sai định dạng hoặc không tồn tại -> `missing` (giữ nguyên thứ tự yêu cầu). Không đổi trạng thái đơn.
 */
export async function printOrders(
  rawCodes: readonly string[],
  role: OrderActor,
): Promise<{ data: AdminOrderDto[]; missing: string[] }> {
  const wanted = [...new Set(rawCodes.map(normalizeOrderCode))];
  const valid = wanted.filter((c) => ORDER_CODE_REGEX.test(c));
  const rows = valid.length
    ? await prisma.order.findMany({
        where: { code: { in: valid } },
        include: adminOrderInclude,
      })
    : [];
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const data: AdminOrderDto[] = [];
  const missing: string[] = [];
  for (const c of wanted) {
    const row = byCode.get(c);
    if (row) data.push(toAdminOrderDto(row, role));
    else missing.push(c);
  }
  return { data, missing };
}
