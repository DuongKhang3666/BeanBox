import { Prisma, type OrderStatus } from '@prisma/client';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { normalizeOrderCode, ORDER_CODE_REGEX } from '../../../lib/orderCode.js';
import {
  allowedTransitions,
  canTransition,
  type OrderActor,
} from '../../../lib/orderStateMachine.js';
import { prisma } from '../../../lib/prisma.js';
import { cancelOrderTx } from '../../orders/orders.cancel.js';
import { notifyOrderStatusChange } from '../../orders/orders.statusEmails.js';
import {
  adminOrderInclude,
  toAdminOrderDto,
  toAdminOrderListItem,
  type AdminOrderDto,
  type AdminOrderListItemDto,
} from './orders.dto.js';
import {
  ORDER_STATUSES,
  type AdminOrdersQuery,
  type RefundPaymentInput,
  type UpdateOrderStatusInput,
} from './orders.schema.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
const VN_OFFSET = '+07:00';
const DEFAULT_CANCEL_REASON = 'Cửa hàng hủy đơn';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
const fieldError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

// ---------------------------------------------------------------------------
// Danh sách

/** Prisma `contains` KHÔNG escape ký tự đại diện của LIKE; Postgres mặc định escape bằng `\`. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** `q` -> điều kiện OR (code / SĐT / email). */
function searchClause(q: string): Prisma.OrderWhereInput[] {
  const clauses: Prisma.OrderWhereInput[] = [
    { code: { contains: escapeLike(q), mode: 'insensitive' } },
    { contactEmail: { contains: escapeLike(q.toLowerCase()) } },
  ];
  let compact = q.replace(/[\s.-]/g, '');
  if (compact.startsWith('+84')) compact = `0${compact.slice(3)}`;
  const digits = compact.replace(/\D/g, '');
  if (digits.length >= 3) clauses.push({ contactPhone: { contains: digits } });
  return clauses;
}

/**
 * Id các đơn cần hoàn tiền (§13.7): có Payment SUCCEEDED VÀ (đơn CANCELLED hoặc >= 2 Payment SUCCEEDED).
 * Tập này nhỏ (chỉ đơn bất thường) nên lấy id rồi lọc bằng `id IN`.
 */
async function ordersNeedingRefund(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o."id" FROM "Order" o
    WHERE EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'SUCCEEDED')
      AND (
        o."status" = 'CANCELLED'
        OR (SELECT COUNT(*) FROM "Payment" p2 WHERE p2."orderId" = o."id" AND p2."status" = 'SUCCEEDED') >= 2
      )`;
  return rows.map((r) => r.id);
}

export function buildOrdersWhere(
  q: AdminOrdersQuery,
  withStatus: boolean,
  refundOrderIds?: readonly string[],
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (refundOrderIds) where.id = { in: [...refundOrderIds] };
  if (withStatus && q.status) where.status = { in: q.status };
  if (q.paymentStatus) where.paymentStatus = { in: q.paymentStatus };
  if (q.paymentMethod) where.paymentMethod = { in: q.paymentMethod };
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000${VN_OFFSET}`) } : {}),
      ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999${VN_OFFSET}`) } : {}),
    };
  }
  if (q.q) where.OR = searchClause(q.q);
  return where;
}

export interface AdminOrderListResult {
  data: AdminOrderListItemDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    statusCounts: Record<string, number>;
  };
}

export async function listOrders(q: AdminOrdersQuery): Promise<AdminOrderListResult> {
  const refundIds = q.needsRefund ? await ordersNeedingRefund() : undefined;
  const where = buildOrdersWhere(q, true, refundIds);
  const dir = q.sort === 'oldest' ? 'asc' : 'desc';

  const [total, rows, grouped] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: dir }, { id: dir }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        code: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        shippingMethod: true,
        contactPhone: true,
        contactEmail: true,
        userId: true,
        shippingAddress: true,
        grandTotal: true,
        createdAt: true,
      },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: buildOrdersWhere(q, false, refundIds),
      _count: { _all: true },
    }),
  ]);

  const sums = rows.length
    ? await prisma.orderItem.groupBy({
        by: ['orderId'],
        where: { orderId: { in: rows.map((r) => r.id) } },
        _sum: { quantity: true },
      })
    : [];
  const qtyByOrder = new Map(sums.map((s) => [s.orderId, s._sum.quantity ?? 0]));
  const paidCounts = rows.length
    ? await prisma.payment.groupBy({
        by: ['orderId'],
        where: { orderId: { in: rows.map((r) => r.id) }, status: 'SUCCEEDED' },
        _count: { _all: true },
      })
    : [];
  const paidByOrder = new Map(paidCounts.map((p) => [p.orderId, p._count._all]));
  const needsRefundOf = (r: { id: string; status: string }) => {
    const n = paidByOrder.get(r.id) ?? 0;
    return n >= 1 && (r.status === 'CANCELLED' || n >= 2);
  };

  const statusCounts: Record<string, number> = Object.fromEntries(
    ORDER_STATUSES.map((s) => [s, 0]),
  );
  for (const g of grouped) statusCounts[g.status] = g._count._all;

  return {
    data: rows.map((r) => toAdminOrderListItem(r, qtyByOrder.get(r.id) ?? 0, needsRefundOf(r))),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      statusCounts,
    },
  };
}

// ---------------------------------------------------------------------------
// Chi tiết

export async function getOrder(rawCode: string, role: OrderActor): Promise<AdminOrderDto> {
  const code = normalizeOrderCode(rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();
  const row = await prisma.order.findUnique({ where: { code }, include: adminOrderInclude });
  if (!row) throw notFound();
  return toAdminOrderDto(row, role);
}

// ---------------------------------------------------------------------------
// Đổi trạng thái

export interface UpdateStatusArgs {
  rawCode: string;
  input: UpdateOrderStatusInput;
  actorId: string;
  role: 'STAFF' | 'ADMIN';
  ip: string | null;
  now?: Date;
}

const staleConflict = (currentStatus: OrderStatus) =>
  new AppError(409, 'CONFLICT', 'Đơn hàng vừa được cập nhật, vui lòng tải lại', {
    currentStatus,
  });

export async function updateOrderStatus(args: UpdateStatusArgs): Promise<AdminOrderDto> {
  const { input, actorId, role, ip } = args;
  const now = args.now ?? new Date();
  const code = normalizeOrderCode(args.rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();
  const to = input.toStatus as OrderStatus;
  const from = input.fromStatus as OrderStatus;

  const { dto, row } = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "code" = ${code} FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    const order = await tx.order.findUniqueOrThrow({ where: { id: locked[0]!.id } });

    // 1. Admin đang xem trạng thái cũ (kiểm TRƯỚC mọi thao tác khác, kể cả cancelOrderTx).
    if (order.status !== from) throw staleConflict(order.status);

    // 2. Máy trạng thái.
    if (!canTransition(from, to, role)) {
      throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Không thể chuyển trạng thái đơn hàng', {
        from,
        to,
        allowed: allowedTransitions(from, role),
      });
    }

    // 3. Trường bắt buộc theo chuyển.
    if (from === 'PROCESSING' && to === 'SHIPPING' && !input.trackingNumber) {
      throw fieldError('trackingNumber', 'Vui lòng nhập mã vận đơn');
    }
    if (
      (to === 'FAILED_DELIVERY' || (from === 'PROCESSING' && to === 'CANCELLED')) &&
      !input.note
    ) {
      throw fieldError('note', 'Vui lòng nhập lý do');
    }

    const before = { status: from, trackingNumber: order.trackingNumber, carrier: order.carrier };
    let after: Record<string, unknown> = { ...before, status: to };

    if (to === 'CANCELLED') {
      await cancelOrderTx(tx, {
        orderId: order.id,
        from,
        actor: role,
        actorId,
        reason: input.note ?? DEFAULT_CANCEL_REASON,
        now,
      });
    } else {
      const data: Prisma.OrderUpdateManyMutationInput = { status: to };
      if (to === 'CONFIRMED') data.confirmedAt = now;
      if (to === 'SHIPPING') {
        if (input.trackingNumber) data.trackingNumber = input.trackingNumber;
        if (input.carrier) data.carrier = input.carrier;
        after = {
          ...after,
          trackingNumber: input.trackingNumber ?? order.trackingNumber,
          carrier: input.carrier ?? order.carrier,
        };
      }
      if (to === 'DELIVERED') {
        data.deliveredAt = now;
        if (order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID') {
          data.paymentStatus = 'PAID';
          data.paidAt = now;
        }
      }
      const updated = await tx.order.updateMany({ where: { id: order.id, status: from }, data });
      if (updated.count === 0) {
        const cur = await tx.order.findUnique({
          where: { id: order.id },
          select: { status: true },
        });
        throw cur ? staleConflict(cur.status) : notFound();
      }

      if (to === 'DELIVERED') {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: { productId: true, quantity: true },
        });
        const qtyByProduct = new Map<string, number>();
        for (const i of items) {
          qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? 0) + i.quantity);
        }
        const productIds = [...qtyByProduct.keys()].sort();
        if (productIds.length > 0) {
          await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR NO KEY UPDATE`;
          for (const productId of productIds) {
            await tx.product.update({
              where: { id: productId },
              data: { soldCount: { increment: qtyByProduct.get(productId)! } },
            });
          }
        }
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: from,
          toStatus: to,
          note: input.note ?? null,
          actorId,
        },
      });
    }

    await writeAudit(tx, {
      actorId,
      action: 'order.status',
      entity: 'Order',
      entityId: order.id,
      diff: diffFields(before, after, ['status', 'trackingNumber', 'carrier']),
      ip,
    });

    const full = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: adminOrderInclude,
    });
    return { dto: toAdminOrderDto(full, role), row: full };
  }, TX_OPTIONS);

  // Sau commit (api-contract §13.9): không gửi khi lỗi; lỗi gửi chỉ log.
  notifyOrderStatusChange(row);
  return dto;
}

// ---------------------------------------------------------------------------
// Hoàn tiền thủ công (api-contract §13.7, D-015)

export interface RefundArgs {
  rawCode: string;
  input: RefundPaymentInput;
  actorId: string;
  ip: string | null;
  now?: Date;
}

export async function refundPayment(args: RefundArgs): Promise<AdminOrderDto> {
  const { input, actorId, ip } = args;
  const now = args.now ?? new Date();
  const code = normalizeOrderCode(args.rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();

  return prisma.$transaction(async (tx) => {
    // Khóa Order rồi Payment (cùng thứ tự applyPaymentResult / job hết hạn).
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "code" = ${code} FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    const orderId = locked[0]!.id;
    const lockedPay = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} AND "orderId" = ${orderId} FOR UPDATE`;
    if (lockedPay.length === 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch');

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, paymentStatus: true },
    });
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (payment.status !== 'SUCCEEDED') {
      throw new AppError(409, 'CONFLICT', 'Giao dịch này không ở trạng thái đã thanh toán');
    }
    const succeeded = await tx.payment.count({ where: { orderId, status: 'SUCCEEDED' } });
    if (order.status !== 'CANCELLED' && succeeded <= 1) {
      throw new AppError(409, 'CONFLICT', 'Hãy hủy đơn trước khi hoàn tiền');
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        refundedAt: now,
        refundNote: input.note,
        refundedById: actorId,
      },
    });
    const allRefunded = succeeded - 1 === 0;
    if (allRefunded && order.paymentStatus !== 'REFUNDED') {
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } });
    }
    await writeAudit(tx, {
      actorId,
      action: 'payment.refund',
      entity: 'Order',
      entityId: orderId,
      diff: {
        status: ['SUCCEEDED', 'REFUNDED'],
        paymentId: [null, payment.id],
        amount: [null, payment.amount],
        orderPaymentStatus: [order.paymentStatus, allRefunded ? 'REFUNDED' : order.paymentStatus],
      },
      ip,
    });

    const full = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: adminOrderInclude,
    });
    return toAdminOrderDto(full, 'ADMIN');
  }, TX_OPTIONS);
}
