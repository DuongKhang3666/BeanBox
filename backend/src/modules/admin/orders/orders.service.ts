import { Prisma, type OrderStatus } from '../../../generated/prisma/client.js';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { normalizeOrderCode, ORDER_CODE_REGEX } from '../../../lib/orderCode.js';
import {
  allowedTransitions,
  canTransition,
  type OrderActor,
} from '../../../lib/orderStateMachine.js';
import { prisma } from '../../../lib/prisma.js';
import {
  generateTrackingNumber,
  SIMULATED_CARRIERS,
  type RandomIntFn,
} from '../../../lib/shipment.js';
import { vnDayEnd, vnDayStart } from '../admin.schema.js';
import { cancelOrderTx, failPendingPaymentsTx } from '../../orders/orders.cancel.js';
import {
  expireStripeSessionsBestEffort,
  type ExpireSessionsOptions,
} from '../../payments/payments.expire.js';
import { uniqueTarget } from '../../orders/orders.service.js';
import { notifyOrderStatusChange } from '../../orders/orders.statusEmails.js';
import { applyPaymentResult } from '../../payments/payments.apply.js';
import { afterPaymentApplied } from '../../payments/payments.service.js';
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
export async function ordersNeedingRefund(): Promise<string[]> {
  // Đi từ Payment SUCCEEDED (tập nhỏ hơn Order) rồi gộp theo đơn; cùng kết quả với dạng EXISTS +
  // subquery đếm theo từng đơn nhưng không chạy subquery cho mỗi đơn (đo ở docs/testing.md, D-054).
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p."orderId" AS id
    FROM "Payment" p
    JOIN "Order" o ON o."id" = p."orderId"
    WHERE p."status" = 'SUCCEEDED'
    GROUP BY p."orderId", o."status"
    HAVING o."status" = 'CANCELLED' OR COUNT(*) >= 2`;
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
  if (q.transferClaimed) {
    where.paymentMethod = 'BANK_TRANSFER';
    where.transferClaimedAt = { not: null };
  }
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: vnDayStart(q.from) } : {}),
      ...(q.to ? { lte: vnDayEnd(q.to) } : {}),
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
        transferClaimedAt: true,
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
  /** Test tiêm bộ sinh số ngẫu nhiên cho mã vận đơn giả. */
  randomInt?: RandomIntFn;
  /** Cấu hình để expire phiên Stripe sau khi hủy (§14.7); test tiêm HTTP giả. */
  stripe?: ExpireSessionsOptions;
}

const MAX_TRACKING_ATTEMPTS = 8;

/** Lỗi unique của chỉ mục `Order_trackingNumber_key` (D-068); đọc tên cột/chỉ mục qua `uniqueTarget`. */
export function isTrackingNumberViolation(e: unknown): boolean {
  return (uniqueTarget(e) ?? '').includes('trackingNumber');
}

/**
 * Chạy transaction đổi trạng thái; mã vận đơn trùng (P2002) -> 409 `TRACKING_NUMBER_TAKEN` nếu do staff nhập,
 * hoặc chạy lại cả transaction (tối đa MAX_TRACKING_ATTEMPTS) nếu mã do server sinh (D-068).
 * Không thể thử lại bên trong cùng transaction vì Postgres hủy transaction sau lỗi unique.
 */
async function runWithTrackingRetry<T>(
  run: () => Promise<T>,
  wasGenerated: () => boolean,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!isTrackingNumberViolation(e)) throw e;
      if (!wasGenerated()) {
        throw new AppError(409, 'TRACKING_NUMBER_TAKEN', 'Mã vận đơn đã được dùng cho đơn khác', {
          field: 'trackingNumber',
        });
      }
      if (attempt >= MAX_TRACKING_ATTEMPTS) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Không thể tạo mã vận đơn, vui lòng thử lại');
      }
    }
  }
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

  let stripeSessionIds: string[] = [];
  let generatedTracking = false;
  const runTx = () =>
    prisma.$transaction(async (tx) => {
      stripeSessionIds = [];
      generatedTracking = false;
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "code" = ${code} FOR UPDATE`;
      if (locked.length === 0) throw notFound();
      const order = await tx.order.findUniqueOrThrow({ where: { id: locked[0]!.id } });

      // 1. Admin đang xem trạng thái cũ (kiểm TRƯỚC mọi thao tác khác, kể cả cancelOrderTx).
      if (order.status !== from) throw staleConflict(order.status);

      // 2. Máy trạng thái.
      if (!canTransition(from, to, role)) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          'Không thể chuyển trạng thái đơn hàng',
          {
            from,
            to,
            allowed: allowedTransitions(from, role),
          },
        );
      }

      // 3. Trường bắt buộc theo chuyển. Mã vận đơn/hãng là TÙY CHỌN (D-062): để trống thì server sinh giả lập.
      if (
        (to === 'FAILED_DELIVERY' || (from === 'PROCESSING' && to === 'CANCELLED')) &&
        !input.note
      ) {
        throw fieldError('note', 'Vui lòng nhập lý do');
      }

      const before = { status: from, trackingNumber: order.trackingNumber, carrier: order.carrier };
      let after: Record<string, unknown> = { ...before, status: to };

      if (to === 'CANCELLED') {
        // Order đã khóa; khóa/đặt FAILED cho Payment PENDING trước khi hoàn kho (D-015, §14.7).
        stripeSessionIds = await failPendingPaymentsTx(tx, order.id);
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
          // Staff nhập thì giữ nguyên; để trống: dùng lại mã đã có (lần SHIPPING trước), chưa có thì sinh giả lập
          // cùng hãng giả lập theo phương thức giao.
          let trackingNumber = input.trackingNumber ?? order.trackingNumber;
          let carrier = input.carrier ?? order.carrier;
          if (!trackingNumber) {
            trackingNumber = generateTrackingNumber(order.shippingMethod, now, args.randomInt);
            generatedTracking = true;
            carrier = input.carrier ?? SIMULATED_CARRIERS[order.shippingMethod].name;
          }
          data.trackingNumber = trackingNumber;
          if (carrier) data.carrier = carrier;
          after = { ...after, trackingNumber, carrier: carrier ?? order.carrier };
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
      return { dto: toAdminOrderDto(full, role, args.now ?? new Date()), row: full };
    }, TX_OPTIONS);
  const { dto, row } = await runWithTrackingRetry(runTx, () => generatedTracking);

  // Sau commit (api-contract §13.9): không gửi khi lỗi; lỗi gửi chỉ log.
  notifyOrderStatusChange(row);
  await expireStripeSessionsBestEffort(row.id, stripeSessionIds, args.stripe);
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

// ---------------------------------------------------------------------------
// Xác nhận đã nhận tiền chuyển khoản (D-061)

export interface ConfirmTransferArgs {
  rawCode: string;
  actorId: string;
  role: OrderActor;
  ip: string | null;
  now?: Date;
}

/**
 * Staff+ xác nhận đã nhận tiền chuyển khoản. Tạo (hoặc dùng lại) Payment BANK_TRANSFER rồi áp kết quả
 * THÀNH CÔNG qua `applyPaymentResult` dùng chung (idempotent; đơn quá hạn/đã hủy -> nhánh trả muộn
 * như D-015 và hiện cờ cần hoàn tiền). Gọi lại không đổi gì và trả 200.
 */
export async function confirmBankTransfer(args: ConfirmTransferArgs): Promise<AdminOrderDto> {
  const now = args.now ?? new Date();
  const code = normalizeOrderCode(args.rawCode);
  if (!ORDER_CODE_REGEX.test(code)) throw notFound();

  const prepared = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "code" = ${code} FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    const order = await tx.order.findUniqueOrThrow({
      where: { id: locked[0]!.id },
      select: { id: true, paymentMethod: true, grandTotal: true },
    });
    if (order.paymentMethod !== 'BANK_TRANSFER') {
      throw new AppError(409, 'CONFLICT', 'Đơn hàng này không thanh toán bằng chuyển khoản');
    }
    const existing = await tx.payment.findFirst({
      where: { orderId: order.id, provider: 'BANK_TRANSFER', status: { not: 'REFUNDED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (existing) return { orderId: order.id, paymentId: existing.id };
    const created = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'BANK_TRANSFER',
        amount: order.grandTotal,
        status: 'PENDING',
        providerRef: code,
      },
      select: { id: true },
    });
    return { orderId: order.id, paymentId: created.id };
  }, TX_OPTIONS);

  const applied = await applyPaymentResult({
    provider: 'BANK_TRANSFER',
    paymentId: prepared.paymentId,
    outcome: 'SUCCEEDED',
    rawPayload: { confirmedBy: 'staff', confirmedAt: now.toISOString() },
    now,
  });
  if (applied.kind === 'APPLIED') {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: args.actorId,
        action: 'payment.bank_transfer_confirm',
        entity: 'Order',
        entityId: prepared.orderId,
        diff: {
          paymentId: [null, prepared.paymentId],
          orderPaymentStatus: [null, applied.order?.paymentStatus ?? null],
          late: [null, applied.late],
        },
        ip: args.ip,
      });
    });
    void afterPaymentApplied(applied);
  }
  return getOrder(code, args.role);
}
