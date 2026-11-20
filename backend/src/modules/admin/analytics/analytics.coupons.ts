import { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { dayNum, resolveRange, ymdOf } from './analytics.range.js';
import type { CouponsQuery, CouponSort } from './analytics.schema.js';
import {
  changePct,
  compared,
  round,
  type Compared,
  type ComparedRate,
} from './analytics.service.js';

/**
 * Hiệu quả mã giảm giá (api-contract §16.4, D-053). Cùng tập đơn và `resolveRange` với §16.1:
 * PAID, không CANCELLED/RETURNED, theo `paidAt` giờ VN. "Đơn có mã" = đơn có `couponId` hoặc
 * `couponCode` (mã đã bị xóa mất `couponId` nhưng còn snapshot `couponCode`).
 */

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

export type CouponKind = 'PERCENT' | 'FIXED' | 'FREESHIP';

export interface CouponStat {
  couponId: string | null;
  code: string;
  type: CouponKind | null;
  isActive: boolean | null;
  deleted: boolean;
  uses: number;
  /** discountTotal; với mã FREESHIP cộng thêm shippingDiscount. */
  discount: number;
  /** Σ grandTotal của đơn dùng mã. */
  revenue: number;
  aov: number;
  previousUses: number;
  previousRevenue: number;
  changePct: number | null;
}

export interface CouponsDto {
  range: { from: string; to: string; days: number; timezone: string };
  previousRange: { from: string; to: string };
  sort: CouponSort;
  limit: number;
  summary: {
    ordersWithCoupon: Compared;
    ordersWithoutCoupon: Compared;
    couponRate: ComparedRate;
    aovWithCoupon: Compared;
    aovWithoutCoupon: Compared;
    totalDiscount: Compared;
  };
  items: CouponStat[];
  generatedAt: string;
}

interface SummaryRow {
  with_cur: Raw;
  without_cur: Raw;
  rev_with_cur: Raw;
  rev_without_cur: Raw;
  discount_cur: Raw;
  with_prev: Raw;
  without_prev: Raw;
  rev_with_prev: Raw;
  rev_without_prev: Raw;
  discount_prev: Raw;
}

interface ItemRow {
  gkey: string;
  coupon_id: string | null;
  code: string;
  type: CouponKind | null;
  is_active: boolean | null;
  uses: Raw;
  discount: Raw;
  revenue: Raw;
  prev_uses: Raw;
  prev_revenue: Raw;
}

const aovOf = (revenue: number, n: number) => (n > 0 ? Math.round(revenue / n) : 0);
const rateOf = (n: number, total: number) => (total > 0 ? round(n / total, 4) : 0);

/** Mảnh SQL cố định theo `sort` (không có input người dùng trong văn bản SQL). */
const ORDER_BY: Record<CouponSort, Prisma.Sql> = {
  revenue: Prisma.sql`ORDER BY revenue DESC, uses DESC, gkey`,
  uses: Prisma.sql`ORDER BY uses DESC, revenue DESC, gkey`,
  discount: Prisma.sql`ORDER BY discount DESC, uses DESC, gkey`,
};

export async function getCoupons(query: CouponsQuery, now: Date = new Date()): Promise<CouponsDto> {
  const range = resolveRange(query, vnDateKey(now));
  const start = vnDayStart(range.previousFrom);
  const cur = vnDayStart(range.from);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1));
  const sort = query.sort ?? 'revenue';
  const limit = query.limit ?? 10;

  const [summaryRows, rows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)))::int AS with_cur,
        (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}
          AND o."couponId" IS NULL AND o."couponCode" IS NULL))::int AS without_cur,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)), 0)::bigint AS rev_with_cur,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}
          AND o."couponId" IS NULL AND o."couponCode" IS NULL), 0)::bigint AS rev_without_cur,
        COALESCE(SUM(o."discountTotal" + CASE WHEN c."type"::text = 'FREESHIP'
          THEN o."shippingDiscount" ELSE 0 END) FILTER (WHERE o."paidAt" >= ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)), 0)::bigint AS discount_cur,
        (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)))::int AS with_prev,
        (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}
          AND o."couponId" IS NULL AND o."couponCode" IS NULL))::int AS without_prev,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)), 0)::bigint AS rev_with_prev,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}
          AND o."couponId" IS NULL AND o."couponCode" IS NULL), 0)::bigint AS rev_without_prev,
        COALESCE(SUM(o."discountTotal" + CASE WHEN c."type"::text = 'FREESHIP'
          THEN o."shippingDiscount" ELSE 0 END) FILTER (WHERE o."paidAt" < ${cur}
          AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)), 0)::bigint AS discount_prev
      FROM "Order" o
      LEFT JOIN "Coupon" c ON c."id" = o."couponId"
      WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}`,
    // Gộp theo couponId; mã đã xóa (couponId null, còn couponCode) gộp theo 'code:' || couponCode.
    // Chỉ liệt kê mã có đơn ở kỳ này; kỳ trước chỉ để so sánh.
    prisma.$queryRaw<ItemRow[]>`
      SELECT COALESCE(o."couponId", 'code:' || o."couponCode") AS gkey,
        MAX(o."couponId") AS coupon_id,
        COALESCE(MAX(c."code"), MAX(o."couponCode")) AS code,
        MAX(c."type"::text) AS type,
        BOOL_OR(c."isActive") AS is_active,
        (COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}))::int AS uses,
        COALESCE(SUM(o."discountTotal" + CASE WHEN c."type"::text = 'FREESHIP'
          THEN o."shippingDiscount" ELSE 0 END) FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS discount,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${cur}), 0)::bigint AS revenue,
        (COUNT(*) FILTER (WHERE o."paidAt" < ${cur}))::int AS prev_uses,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" < ${cur}), 0)::bigint AS prev_revenue
      FROM "Order" o
      LEFT JOIN "Coupon" c ON c."id" = o."couponId"
      WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
        AND (o."couponId" IS NOT NULL OR o."couponCode" IS NOT NULL)
      GROUP BY gkey
      HAVING COUNT(*) FILTER (WHERE o."paidAt" >= ${cur}) > 0
      ${ORDER_BY[sort]}
      LIMIT ${limit}`,
  ]);

  const s = summaryRows[0];
  const withCur = num(s?.with_cur ?? 0);
  const withoutCur = num(s?.without_cur ?? 0);
  const withPrev = num(s?.with_prev ?? 0);
  const withoutPrev = num(s?.without_prev ?? 0);
  const curRate = rateOf(withCur, withCur + withoutCur);
  const prevRate = rateOf(withPrev, withPrev + withoutPrev);

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: 'Asia/Ho_Chi_Minh' },
    previousRange: { from: range.previousFrom, to: range.previousTo },
    sort,
    limit,
    summary: {
      ordersWithCoupon: compared(withCur, withPrev),
      ordersWithoutCoupon: compared(withoutCur, withoutPrev),
      couponRate: {
        current: curRate,
        previous: prevRate,
        changePts: withPrev + withoutPrev === 0 ? null : round((curRate - prevRate) * 100, 1),
      },
      aovWithCoupon: compared(
        aovOf(num(s?.rev_with_cur ?? 0), withCur),
        aovOf(num(s?.rev_with_prev ?? 0), withPrev),
      ),
      aovWithoutCoupon: compared(
        aovOf(num(s?.rev_without_cur ?? 0), withoutCur),
        aovOf(num(s?.rev_without_prev ?? 0), withoutPrev),
      ),
      totalDiscount: compared(num(s?.discount_cur ?? 0), num(s?.discount_prev ?? 0)),
    },
    items: rows.map((r) => {
      const uses = num(r.uses);
      const revenue = num(r.revenue);
      const previousRevenue = num(r.prev_revenue);
      return {
        couponId: r.coupon_id,
        code: r.code,
        type: r.type,
        isActive: r.is_active,
        deleted: r.coupon_id === null,
        uses,
        discount: num(r.discount),
        revenue,
        aov: aovOf(revenue, uses),
        previousUses: num(r.prev_uses),
        previousRevenue,
        changePct: changePct(revenue, previousRevenue),
      };
    }),
    generatedAt: now.toISOString(),
  };
}
