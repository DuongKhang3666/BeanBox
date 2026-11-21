import { prisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { dayNum, resolveRange, ymdOf } from './analytics.range.js';
import type { BreakdownDimension, BreakdownQuery } from './analytics.schema.js';
import { changePct } from './analytics.service.js';

/**
 * Cơ cấu doanh thu (api-contract §16.2, D-051). Tập đơn nguồn đúng định nghĩa doanh thu D-049:
 * `paymentStatus = PAID`, `status` không thuộc {CANCELLED, RETURNED}, theo `paidAt` (giờ VN).
 * Kỳ hiện tại và kỳ trước nằm trong cùng một truy vấn (FILTER theo `paidAt`).
 */

export const MAX_GROUPS = 50;
export const OTHER_KEY = '__other__';
export const UNKNOWN_KEY = '__unknown__';

export type Basis = 'order' | 'item';

export interface BreakdownGroup {
  key: string | null;
  label: string;
  revenue: number;
  orders: number;
  quantity: number | null;
  share: number;
  previousRevenue: number;
  changePct: number | null;
}

export interface BreakdownTotal {
  revenue: number;
  orders: number;
  quantity: number | null;
}

export interface BreakdownDto {
  range: { from: string; to: string; days: number; timezone: string };
  previousRange: { from: string; to: string };
  dimension: BreakdownDimension;
  basis: Basis;
  total: BreakdownTotal;
  previousTotal: BreakdownTotal;
  groups: BreakdownGroup[];
  generatedAt: string;
}

/** Một nhóm thô từ SQL (chưa tính share/changePct). */
export interface RawGroup {
  key: string | null;
  label: string;
  revenue: number;
  orders: number;
  quantity: number | null;
  previousRevenue: number;
}

const PAYMENT_LABEL: Record<string, string> = {
  COD: 'Thanh toán khi nhận hàng (COD)',
  VNPAY: 'VNPay (ATM/QR/thẻ)',
  STRIPE: 'Thẻ quốc tế (Stripe)',
};
const SHIPPING_LABEL: Record<string, string> = { STANDARD: 'Tiêu chuẩn', EXPRESS: 'Nhanh' };

const NO_BRAND = 'Không có thương hiệu';
const UNKNOWN = 'Không xác định';

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Hàm thuần: sắp xếp (doanh thu giảm dần, rồi nhãn), gộp phần vượt `max` thành nhóm "Khác",
 * tính tỷ trọng và % so với kỳ trước. Tổng doanh thu các nhóm trả về luôn bằng tổng đầu vào.
 */
export function assembleGroups(
  raw: RawGroup[],
  totalRevenue: number,
  max: number = MAX_GROUPS,
): BreakdownGroup[] {
  const sorted = [...raw].sort(
    (a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label, 'vi'),
  );
  let kept = sorted;
  if (sorted.length > max) {
    const rest = sorted.slice(max - 1);
    kept = [
      ...sorted.slice(0, max - 1),
      {
        key: OTHER_KEY,
        label: 'Khác',
        revenue: rest.reduce((s, g) => s + g.revenue, 0),
        // Chiều dòng hàng: số đơn không cộng dồn được (một đơn có thể thuộc nhiều nhóm); đây là tổng.
        orders: rest.reduce((s, g) => s + g.orders, 0),
        quantity:
          rest[0]!.quantity === null ? null : rest.reduce((s, g) => s + (g.quantity ?? 0), 0),
        previousRevenue: rest.reduce((s, g) => s + g.previousRevenue, 0),
      },
    ];
  }
  return kept.map((g) => ({
    key: g.key,
    label: g.label,
    revenue: g.revenue,
    orders: g.orders,
    quantity: g.quantity,
    share: totalRevenue > 0 ? round4(g.revenue / totalRevenue) : 0,
    previousRevenue: g.previousRevenue,
    changePct: changePct(g.revenue, g.previousRevenue),
  }));
}

type Raw = bigint | number | null;
const num = (v: Raw | undefined) => Number(v ?? 0);

interface OrderRow {
  key: string | null;
  label: string | null;
  revenue: Raw;
  orders: Raw;
  prev_revenue: Raw;
  prev_orders: Raw;
}
interface ItemRow extends OrderRow {
  quantity: Raw;
  prev_quantity: Raw;
}
interface ItemTotalRow {
  revenue: Raw;
  orders: Raw;
  quantity: Raw;
  prev_revenue: Raw;
  prev_orders: Raw;
  prev_quantity: Raw;
}

export const BASIS: Record<BreakdownDimension, Basis> = {
  category: 'item',
  brand: 'item',
  paymentMethod: 'order',
  shippingMethod: 'order',
  province: 'order',
};

export async function getBreakdown(
  query: BreakdownQuery,
  now: Date = new Date(),
): Promise<BreakdownDto> {
  const range = resolveRange(query, vnDateKey(now));
  const start = vnDayStart(range.previousFrom);
  const cur = vnDayStart(range.from); // từ đây trở đi là kỳ hiện tại
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1)); // loại trừ
  const dimension = query.dimension;
  const basis = BASIS[dimension];

  let groups: BreakdownGroup[];
  let total: BreakdownTotal;
  let previousTotal: BreakdownTotal;

  if (basis === 'order') {
    // Chiều cấp đơn: mỗi đơn thuộc đúng một nhóm; revenue = Σ grandTotal; tổng = kpis.revenue.
    // Các câu SQL cố định theo nhánh code, không chèn tên cột từ input.
    let rows: OrderRow[];
    if (dimension === 'paymentMethod') {
      rows = await prisma.$queryRaw<OrderRow[]>`
        SELECT o."paymentMethod"::text AS key, NULL::text AS label,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}))::int AS orders,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_orders
        FROM "Order" o
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY 1`;
    } else if (dimension === 'shippingMethod') {
      rows = await prisma.$queryRaw<OrderRow[]>`
        SELECT o."shippingMethod"::text AS key, NULL::text AS label,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}))::int AS orders,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_orders
        FROM "Order" o
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY 1`;
    } else {
      // province: snapshot trong shippingAddress (Json); thiếu mã -> nhóm key null.
      rows = await prisma.$queryRaw<OrderRow[]>`
        SELECT NULLIF(btrim(o."shippingAddress"->>'provinceCode'), '') AS key,
          MAX(NULLIF(btrim(o."shippingAddress"->>'provinceName'), '')) AS label,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}))::int AS orders,
          COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
          (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_orders
        FROM "Order" o
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY 1`;
    }
    const labelOf = (k: string | null, l: string | null): string => {
      if (dimension === 'paymentMethod') return PAYMENT_LABEL[k ?? ''] ?? k ?? UNKNOWN;
      if (dimension === 'shippingMethod') return SHIPPING_LABEL[k ?? ''] ?? k ?? UNKNOWN;
      return l ?? k ?? UNKNOWN;
    };
    total = { revenue: 0, orders: 0, quantity: null };
    previousTotal = { revenue: 0, orders: 0, quantity: null };
    const raw: RawGroup[] = [];
    for (const r of rows) {
      total.revenue += num(r.revenue);
      total.orders += num(r.orders);
      previousTotal.revenue += num(r.prev_revenue);
      previousTotal.orders += num(r.prev_orders);
      if (num(r.orders) === 0) continue; // chỉ có ở kỳ trước: không liệt kê
      raw.push({
        key: r.key,
        label: labelOf(r.key, r.label),
        revenue: num(r.revenue),
        orders: num(r.orders),
        quantity: null,
        previousRevenue: num(r.prev_revenue),
      });
    }
    groups = assembleGroups(raw, total.revenue);
  } else {
    // Chiều cấp dòng hàng: revenue = Σ OrderItem.lineTotal (hàng hóa, chưa trừ giảm giá cấp đơn,
    // không gồm phí ship); orders = số đơn khác nhau trong nhóm.
    // Hai truy vấn độc lập chạy song song (nhóm, tổng toàn tập).
    const groupQuery =
      dimension === 'category'
        ? prisma.$queryRaw<ItemRow[]>`
        SELECT COALESCE(p."categoryId", ${UNKNOWN_KEY}) AS key, MAX(c."name") AS label,
          COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
          COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS quantity,
          (COUNT(DISTINCT o."id") FILTER (WHERE o."paidAt" >= ${cur}))::int AS orders,
          COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
          COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_quantity,
          (COUNT(DISTINCT o."id") FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_orders
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        LEFT JOIN "Product" p ON p."id" = oi."productId"
        LEFT JOIN "Category" c ON c."id" = p."categoryId"
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY 1`
        : prisma.$queryRaw<ItemRow[]>`
        SELECT CASE WHEN p."id" IS NULL THEN ${UNKNOWN_KEY} ELSE p."brandId" END AS key,
          MAX(b."name") AS label,
          COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
          COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS quantity,
          (COUNT(DISTINCT o."id") FILTER (WHERE o."paidAt" >= ${cur}))::int AS orders,
          COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
          COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_quantity,
          (COUNT(DISTINCT o."id") FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_orders
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        LEFT JOIN "Product" p ON p."id" = oi."productId"
        LEFT JOIN "Brand" b ON b."id" = p."brandId"
        WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
          AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        GROUP BY 1`;
    // Tổng toàn tập (số đơn khác nhau không bằng tổng các nhóm). Số đơn đếm trên "Order" (bán nối
    // với EXISTS dòng hàng) thay vì COUNT(DISTINCT) trên phép nối đơn x dòng hàng: tránh sắp xếp
    // hàng trăm nghìn dòng ra đĩa (D-054); cùng kết quả: đơn có ít nhất một dòng hàng.
    const totalQuery = prisma.$queryRaw<ItemTotalRow[]>`
      SELECT COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
        COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS quantity,
        COALESCE(SUM(oi."lineTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue,
        COALESCE(SUM(oi."quantity") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_quantity,
        (SELECT (COUNT(*) FILTER (WHERE o2."paidAt" >= ${cur}))::int FROM "Order" o2
          WHERE o2."paymentStatus" = 'PAID' AND o2."status" NOT IN ('CANCELLED', 'RETURNED')
            AND o2."paidAt" >= ${start} AND o2."paidAt" < ${end}
            AND EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o2."id")) AS orders,
        (SELECT (COUNT(*) FILTER (WHERE o2."paidAt" < ${cur}))::int FROM "Order" o2
          WHERE o2."paymentStatus" = 'PAID' AND o2."status" NOT IN ('CANCELLED', 'RETURNED')
            AND o2."paidAt" >= ${start} AND o2."paidAt" < ${end}
            AND EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o2."id")) AS prev_orders
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}`;
    const [rows, [t]] = await Promise.all([groupQuery, totalQuery]);
    total = { revenue: num(t?.revenue), orders: num(t?.orders), quantity: num(t?.quantity) };
    previousTotal = {
      revenue: num(t?.prev_revenue),
      orders: num(t?.prev_orders),
      quantity: num(t?.prev_quantity),
    };
    const raw: RawGroup[] = [];
    for (const r of rows) {
      if (num(r.orders) === 0) continue;
      const unknown = r.key === UNKNOWN_KEY;
      raw.push({
        key: unknown ? UNKNOWN_KEY : r.key,
        label: unknown ? UNKNOWN : (r.label ?? (dimension === 'brand' ? NO_BRAND : UNKNOWN)),
        revenue: num(r.revenue),
        orders: num(r.orders),
        quantity: num(r.quantity),
        previousRevenue: num(r.prev_revenue),
      });
    }
    groups = assembleGroups(raw, total.revenue);
  }

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: 'Asia/Ho_Chi_Minh' },
    previousRange: { from: range.previousFrom, to: range.previousTo },
    dimension,
    basis,
    total,
    previousTotal,
    groups,
    generatedAt: now.toISOString(),
  };
}
