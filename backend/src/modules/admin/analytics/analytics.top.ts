import { Prisma } from '../../../generated/prisma/client.js';
import { analyticsPrisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { dayNum, resolveRange, ymdOf } from './analytics.range.js';
import type { TopCustomersQuery, TopProductsQuery } from './analytics.schema.js';

/**
 * Top sản phẩm / top khách hàng (api-contract §16.2, D-051). Cùng tập đơn nguồn và cùng
 * `resolveRange` với overview: PAID, không CANCELLED/RETURNED, theo `paidAt` giờ VN.
 */

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

const rangeOut = (r: ReturnType<typeof resolveRange>) => ({
  from: r.from,
  to: r.to,
  days: r.days,
  timezone: 'Asia/Ho_Chi_Minh',
});

export interface TopProduct {
  productId: string;
  name: string;
  slug: string | null;
  deleted: boolean;
  categoryName: string | null;
  revenue: number;
  quantity: number;
  orders: number;
  /** D-078: giá vốn hàng bán của các dòng có giá vốn; null khi KHÔNG dòng nào có giá vốn. */
  cogs: number | null;
  /** (doanh thu hàng hóa thuần - giá vốn) của các dòng có giá vốn; null khi thiếu giá vốn. */
  grossProfit: number | null;
  /** grossProfit / doanh thu hàng hóa thuần của các dòng có giá vốn (0..1); null khi thiếu. */
  margin: number | null;
  /** Σ lineTotal dòng có giá vốn / Σ lineTotal (0..1). */
  costCoverage: number;
}

export interface TopProductsDto {
  range: { from: string; to: string; days: number; timezone: string };
  sort: 'revenue' | 'quantity';
  limit: number;
  items: TopProduct[];
  generatedAt: string;
}

interface ProductRow {
  product_id: string;
  name: string;
  slug: string | null;
  deleted: boolean;
  category_name: string | null;
  revenue: Raw;
  quantity: Raw;
  orders: Raw;
  costed_lines: Raw;
  costed_total: Raw;
  costed_net: Raw;
  cogs: Raw;
}

const ORDER_BY_REVENUE = Prisma.sql`revenue DESC, quantity DESC, li."productId"`;
const ORDER_BY_QUANTITY = Prisma.sql`quantity DESC, revenue DESC, li."productId"`;

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

export async function getTopProducts(
  query: TopProductsQuery,
  now: Date = new Date(),
): Promise<TopProductsDto> {
  const range = resolveRange(query, vnDateKey(now));
  const start = vnDayStart(range.from);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1));
  const sort = query.sort ?? 'revenue';
  const limit = query.limit ?? 10;

  // Tên hiện tại của sản phẩm, thiếu thì tên đã lưu trên dòng hàng; sản phẩm xóa mềm vẫn tính
  // (deleted = true). `li`: một dòng hàng + giảm giá cấp đơn đã phân bổ cho dòng theo tỷ lệ
  // lineTotal (làm tròn nửa lên, D-078); cửa sổ theo đơn nên không N+1. ORDER BY chọn từ hai
  // mảnh cố định (không nối chuỗi từ input).
  const rows = await analyticsPrisma.$queryRaw<ProductRow[]>`
    WITH li AS (
      SELECT oi."productId", oi."productName", o."id" AS order_id, oi."lineTotal", oi."quantity",
        oi."unitCost",
        CASE WHEN SUM(oi."lineTotal") OVER (PARTITION BY o."id") > 0
          THEN (2 * o."discountTotal"::bigint * oi."lineTotal"
                + SUM(oi."lineTotal") OVER (PARTITION BY o."id"))
               / (2 * SUM(oi."lineTotal") OVER (PARTITION BY o."id"))
          ELSE 0 END AS alloc
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
    )
    SELECT li."productId" AS product_id,
      COALESCE(MAX(p."name"), MAX(li."productName")) AS name,
      MAX(p."slug") AS slug,
      BOOL_OR(p."id" IS NULL OR p."deletedAt" IS NOT NULL) AS deleted,
      MAX(c."name") AS category_name,
      SUM(li."lineTotal")::bigint AS revenue,
      SUM(li."quantity")::bigint AS quantity,
      COUNT(DISTINCT li.order_id)::int AS orders,
      (COUNT(*) FILTER (WHERE li."unitCost" IS NOT NULL))::int AS costed_lines,
      COALESCE(SUM(li."lineTotal") FILTER (WHERE li."unitCost" IS NOT NULL), 0)::bigint AS costed_total,
      COALESCE(SUM(li."lineTotal" - li.alloc) FILTER (WHERE li."unitCost" IS NOT NULL), 0)::bigint AS costed_net,
      COALESCE(SUM(li."unitCost"::bigint * li."quantity") FILTER (WHERE li."unitCost" IS NOT NULL), 0)::bigint AS cogs
    FROM li
    LEFT JOIN "Product" p ON p."id" = li."productId"
    LEFT JOIN "Category" c ON c."id" = p."categoryId"
    GROUP BY li."productId"
    ORDER BY ${sort === 'quantity' ? ORDER_BY_QUANTITY : ORDER_BY_REVENUE}
    LIMIT ${limit}`;

  return {
    range: rangeOut(range),
    sort,
    limit,
    items: rows.map((r) => {
      const revenue = num(r.revenue);
      const hasCost = num(r.costed_lines) > 0;
      const net = num(r.costed_net);
      const cogs = num(r.cogs);
      return {
        productId: r.product_id,
        name: r.name,
        slug: r.slug,
        deleted: r.deleted,
        categoryName: r.category_name,
        revenue,
        quantity: num(r.quantity),
        orders: num(r.orders),
        cogs: hasCost ? cogs : null,
        grossProfit: hasCost ? net - cogs : null,
        margin: hasCost && net > 0 ? round4((net - cogs) / net) : null,
        costCoverage: revenue > 0 ? round4(num(r.costed_total) / revenue) : 0,
      };
    }),
    generatedAt: now.toISOString(),
  };
}

export interface TopCustomer {
  customerType: 'registered' | 'guest';
  userId: string | null;
  name: string;
  email: string;
  orders: number;
  revenue: number;
  aov: number;
  lastPaidAt: string | null;
}

export interface TopCustomersDto {
  range: { from: string; to: string; days: number; timezone: string };
  sort: 'revenue' | 'orders';
  limit: number;
  items: TopCustomer[];
  generatedAt: string;
}

interface CustomerRow {
  user_id: string | null;
  guest_email: string | null;
  user_name: string | null;
  user_email: string | null;
  guest_name: string | null;
  revenue: Raw;
  orders: Raw;
  last_paid_at: Date | null;
}

export async function getTopCustomers(
  query: TopCustomersQuery,
  now: Date = new Date(),
): Promise<TopCustomersDto> {
  const range = resolveRange(query, vnDateKey(now));
  const start = vnDayStart(range.from);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1));
  const sort = query.sort ?? 'revenue';
  const limit = query.limit ?? 10;

  // Gộp theo userId khi có; khách vãng lai theo lower(contactEmail). Chỉ chọn tên + email,
  // không đọc SĐT hay địa chỉ (chỉ lấy fullName từ snapshot của đơn mới nhất).
  const rows =
    sort === 'orders'
      ? await analyticsPrisma.$queryRaw<CustomerRow[]>`
        SELECT o."userId" AS user_id,
          CASE WHEN o."userId" IS NULL THEN lower(o."contactEmail") END AS guest_email,
          MAX(u."fullName") AS user_name, MAX(u."email") AS user_email,
          (array_agg(o."shippingAddress"->>'fullName' ORDER BY o."paidAt" DESC))[1] AS guest_name,
          SUM(o."grandTotal")::bigint AS revenue, COUNT(*)::int AS orders,
          MAX(o."paidAt") AS last_paid_at
        FROM "Order" o
        LEFT JOIN "User" u ON u."id" = o."userId"
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY o."userId", CASE WHEN o."userId" IS NULL THEN lower(o."contactEmail") END
        ORDER BY orders DESC, revenue DESC, MAX(o."paidAt") DESC, o."userId", guest_email
        LIMIT ${limit}`
      : await analyticsPrisma.$queryRaw<CustomerRow[]>`
        SELECT o."userId" AS user_id,
          CASE WHEN o."userId" IS NULL THEN lower(o."contactEmail") END AS guest_email,
          MAX(u."fullName") AS user_name, MAX(u."email") AS user_email,
          (array_agg(o."shippingAddress"->>'fullName' ORDER BY o."paidAt" DESC))[1] AS guest_name,
          SUM(o."grandTotal")::bigint AS revenue, COUNT(*)::int AS orders,
          MAX(o."paidAt") AS last_paid_at
        FROM "Order" o
        LEFT JOIN "User" u ON u."id" = o."userId"
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY o."userId", CASE WHEN o."userId" IS NULL THEN lower(o."contactEmail") END
        ORDER BY revenue DESC, orders DESC, MAX(o."paidAt") DESC, o."userId", guest_email
        LIMIT ${limit}`;

  return {
    range: rangeOut(range),
    sort,
    limit,
    items: rows.map((r) => {
      const registered = r.user_id !== null;
      const revenue = num(r.revenue);
      const orders = num(r.orders);
      const email = registered ? (r.user_email ?? '') : (r.guest_email ?? '');
      return {
        customerType: registered ? ('registered' as const) : ('guest' as const),
        userId: r.user_id,
        name: (registered ? r.user_name : r.guest_name)?.trim() || email,
        email,
        orders,
        revenue,
        aov: orders > 0 ? Math.round(revenue / orders) : 0,
        lastPaidAt: r.last_paid_at ? r.last_paid_at.toISOString() : null,
      };
    }),
    generatedAt: now.toISOString(),
  };
}
