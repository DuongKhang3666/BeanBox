import { Prisma, type OrderStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { allowedTransitions, canTransition, type OrderActor } from '../../lib/orderStateMachine.js';
import { refreshProductDenorm } from '../catalog/catalog.denorm.js';

type Db = Prisma.TransactionClient;

export interface CancelOrderArgs {
  orderId: string;
  /** Trạng thái người gọi đã đọc được; dùng làm điều kiện optimistic. */
  from: OrderStatus;
  actor: OrderActor;
  /** null = khách vãng lai hoặc hệ thống. */
  actorId: string | null;
  reason: string | null;
  note?: string | null;
  now: Date;
}

const invalidTransition = (from: OrderStatus, actor: OrderActor) =>
  new AppError(409, 'INVALID_STATUS_TRANSITION', 'Không thể hủy đơn hàng ở trạng thái hiện tại', {
    from,
    to: 'CANCELLED',
    allowed: allowedTransitions(from, actor),
  });

/**
 * Hủy đơn trong transaction của người gọi. Dùng chung cho khách (M3), staff (M4) và job hết hạn
 * PENDING_PAYMENT (M5, actor SYSTEM).
 *
 * Thứ tự khóa khớp placeOrder: Order -> ProductVariant (id tăng dần) -> Product (id tăng dần) -> Coupon.
 * `UPDATE ... WHERE status = from` bảo đảm hoàn kho/hoàn lượt mã chỉ chạy đúng 1 lần
 * kể cả khi nhiều request hủy song song.
 */
export async function cancelOrderTx(tx: Db, args: CancelOrderArgs): Promise<void> {
  const { orderId, from, actor, actorId, reason, now } = args;

  if (!canTransition(from, 'CANCELLED', actor)) throw invalidTransition(from, actor);

  const updated = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason },
  });
  if (updated.count === 0) {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
    throw invalidTransition(current.status, actor);
  }

  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: from,
      toStatus: 'CANCELLED',
      note: reason ?? args.note ?? null,
      actorId,
    },
  });

  // Hoàn kho: gộp theo variant, tăng dần id.
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { variantId: true, productId: true, quantity: true },
  });
  const qtyByVariant = new Map<string, number>();
  for (const i of items)
    qtyByVariant.set(i.variantId, (qtyByVariant.get(i.variantId) ?? 0) + i.quantity);
  const variantIds = [...qtyByVariant.keys()].sort();
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  for (const variantId of variantIds) {
    const qty = qtyByVariant.get(variantId)!;
    const rows = await tx.$queryRaw<Array<{ stock: number }>>`
      UPDATE "ProductVariant" SET "stock" = "stock" + ${qty}::int, "updatedAt" = now()
      WHERE "id" = ${variantId}
      RETURNING "stock"`;
    if (rows.length === 0) continue; // variant bị xóa cứng: không còn gì để hoàn
    movements.push({
      variantId,
      change: qty,
      stockAfter: Number(rows[0]!.stock),
      reason: 'ORDER_RELEASE',
      orderId,
      actorId,
    });
  }
  if (movements.length > 0) await tx.inventoryMovement.createMany({ data: movements });

  const productIds = [...new Set(items.map((i) => i.productId))].sort();
  if (productIds.length > 0) {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR NO KEY UPDATE`;
    for (const productId of productIds) await refreshProductDenorm(tx, productId, now);
  }

  // Hoàn lượt mã (D-004): chỉ khi dòng redemption chưa được hoàn.
  const released = await tx.$queryRaw<Array<{ couponId: string }>>`
    UPDATE "CouponRedemption" SET "releasedAt" = now()
    WHERE "orderId" = ${orderId} AND "releasedAt" IS NULL
    RETURNING "couponId"`;
  if (released.length > 0) {
    await tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = "usedCount" - 1, "updatedAt" = now()
      WHERE "id" = ${released[0]!.couponId} AND "usedCount" > 0`;
  }
}
