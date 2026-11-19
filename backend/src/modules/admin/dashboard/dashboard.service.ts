import { prisma } from '../../../lib/prisma.js';
import { ordersNeedingRefund } from '../orders/orders.service.js';
import { ORDER_STATUSES } from '../orders/orders.schema.js';

/** Dashboard (api-contract §14.3, D-019). Mọi mốc ngày theo giờ Việt Nam (UTC+7). */

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DAYS = 30;
const TOP_PRODUCTS_LIMIT = 5;
const LOW_STOCK_LIMIT = 10;

/** 00:00 giờ VN của ngày chứa `d`, trả về dạng thời điểm UTC. */
export function vnStartOfDay(d: Date): Date {
  const vn = d.getTime() + VN_OFFSET_MS;
  return new Date(Math.floor(vn / DAY_MS) * DAY_MS - VN_OFFSET_MS);
}

/** `YYYY-MM-DD` theo giờ VN của thời điểm `d`. */
const vnDateKey = (d: Date) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export interface DashboardDto {
  revenue: { today: number; last7Days: number; last30Days: number };
  orders: { today: number; last7Days: number; last30Days: number };
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>;
  ordersByStatus: Record<string, number>;
  topProducts: Array<{
    productId: string;
    name: string;
    slug: string;
    quantity: number;
    revenue: number;
  }>;
  lowStock: Array<{
    variantId: string;
    sku: string;
    productName: string;
    variantName: string;
    stock: number;
    lowStockThreshold: number;
  }>;
  attention: { pendingOrders: number; needsRefund: number };
  generatedAt: string;
}

interface DayRow {
  d: string;
  total: bigint | number | null;
  n: bigint | number;
}

export async function getDashboard(now: Date = new Date()): Promise<DashboardDto> {
  const todayStart = vnStartOfDay(now);
  const rangeStart = new Date(todayStart.getTime() - (DAYS - 1) * DAY_MS);
  const rangeEnd = new Date(todayStart.getTime() + DAY_MS); // loại trừ

  const [paidRows, createdRows, statusGroups, topRows, lowRows, pendingOrders, refundIds] =
    await Promise.all([
      // Doanh thu theo paidAt (D-019): đơn PAID, trừ CANCELLED/RETURNED (REFUNDED không phải PAID).
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char("paidAt" + interval '7 hours', 'YYYY-MM-DD') AS d,
               SUM("grandTotal")::bigint AS total, COUNT(*)::int AS n
        FROM "Order"
        WHERE "paymentStatus" = 'PAID'
          AND "status" NOT IN ('CANCELLED', 'RETURNED')
          AND "paidAt" >= ${rangeStart} AND "paidAt" < ${rangeEnd}
        GROUP BY d`,
      // Số đơn theo createdAt, mọi trạng thái.
      prisma.$queryRaw<DayRow[]>`
        SELECT to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') AS d,
               NULL::bigint AS total, COUNT(*)::int AS n
        FROM "Order"
        WHERE "createdAt" >= ${rangeStart} AND "createdAt" < ${rangeEnd}
        GROUP BY d`,
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.$queryRaw<
        Array<{ productId: string; quantity: bigint | number; revenue: bigint | number }>
      >`
        SELECT oi."productId" AS "productId", SUM(oi."quantity")::bigint AS quantity,
               SUM(oi."lineTotal")::bigint AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."createdAt" >= ${rangeStart} AND o."createdAt" < ${rangeEnd}
          AND o."status" NOT IN ('CANCELLED', 'PENDING_PAYMENT')
        GROUP BY oi."productId"
        ORDER BY quantity DESC, revenue DESC, oi."productId" ASC
        LIMIT ${TOP_PRODUCTS_LIMIT}`,
      prisma.$queryRaw<
        Array<{
          variantId: string;
          sku: string;
          productName: string;
          variantName: string;
          stock: number;
          lowStockThreshold: number;
        }>
      >`
        SELECT v."id" AS "variantId", v."sku", p."name" AS "productName", v."name" AS "variantName",
               v."stock", v."lowStockThreshold"
        FROM "ProductVariant" v
        JOIN "Product" p ON p."id" = v."productId"
        WHERE v."isActive" = true AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL
          AND v."stock" <= v."lowStockThreshold"
        ORDER BY v."stock" ASC, v."sku" ASC
        LIMIT ${LOW_STOCK_LIMIT}`,
      prisma.order.count({ where: { status: 'PENDING' } }),
      ordersNeedingRefund(),
    ]);

  // dailyRevenue: đúng 30 phần tử tăng dần theo ngày VN.
  const days = new Map<string, { date: string; revenue: number; orders: number }>();
  for (let i = 0; i < DAYS; i++) {
    const date = vnDateKey(new Date(rangeStart.getTime() + i * DAY_MS));
    days.set(date, { date, revenue: 0, orders: 0 });
  }
  for (const r of paidRows) {
    const day = days.get(r.d);
    if (day) day.revenue = Number(r.total ?? 0);
  }
  for (const r of createdRows) {
    const day = days.get(r.d);
    if (day) day.orders = Number(r.n);
  }
  const dailyRevenue = [...days.values()];

  const sum = (n: number, key: 'revenue' | 'orders') =>
    dailyRevenue.slice(-n).reduce((acc, d) => acc + d[key], 0);

  const ordersByStatus: Record<string, number> = Object.fromEntries(
    ORDER_STATUSES.map((s) => [s, 0]),
  );
  for (const g of statusGroups) ordersByStatus[g.status] = g._count._all;

  const products = topRows.length
    ? await prisma.product.findMany({
        where: { id: { in: topRows.map((r) => r.productId) } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const topProducts = topRows.flatMap((r) => {
    const p = productById.get(r.productId);
    return p
      ? [
          {
            productId: r.productId,
            name: p.name,
            slug: p.slug,
            quantity: Number(r.quantity),
            revenue: Number(r.revenue),
          },
        ]
      : [];
  });

  return {
    revenue: {
      today: sum(1, 'revenue'),
      last7Days: sum(7, 'revenue'),
      last30Days: sum(30, 'revenue'),
    },
    orders: { today: sum(1, 'orders'), last7Days: sum(7, 'orders'), last30Days: sum(30, 'orders') },
    dailyRevenue,
    ordersByStatus,
    topProducts,
    lowStock: lowRows.map((r) => ({ ...r, stock: Number(r.stock) })),
    attention: { pendingOrders, needsRefund: refundIds.length },
    generatedAt: now.toISOString(),
  };
}
