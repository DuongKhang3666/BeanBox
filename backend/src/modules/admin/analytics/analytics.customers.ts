import { analyticsPrisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { dayNum, resolveRange, ymdOf } from './analytics.range.js';
import type { RangeOnlyQuery } from './analytics.schema.js';
import { compared, round, type Compared, type ComparedRate } from './analytics.service.js';

/**
 * Khách hàng: mua lần đầu so với quay lại (api-contract §16.3, D-052).
 * Khóa khách = `userId` nếu có, ngược lại `lower(contactEmail)` (D-051). "Đơn tính doanh thu" =
 * D-019 (PAID, không CANCELLED/RETURNED) theo `paidAt`.
 */

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

export interface CustomersDto {
  range: { from: string; to: string; days: number; timezone: string };
  previousRange: { from: string; to: string };
  buyers: Compared;
  firstTime: Compared;
  returning: Compared;
  repeatRate: ComparedRate;
  firstTimeRevenue: Compared;
  returningRevenue: Compared;
  generatedAt: string;
}

export interface CustomerAgg {
  buyers: number;
  firstTime: number;
  repeaters: number;
  firstTimeRevenue: number;
  returningRevenue: number;
}

interface AggRow {
  cur_buyers: Raw;
  cur_first: Raw;
  cur_repeat: Raw;
  cur_first_rev: Raw;
  cur_ret_rev: Raw;
  prev_buyers: Raw;
  prev_first: Raw;
  prev_repeat: Raw;
  prev_first_rev: Raw;
  prev_ret_rev: Raw;
}

const rateOf = (n: number, d: number) => (d > 0 ? round(n / d, 4) : 0);

/** Hàm thuần (kiểm thử không cần DB): số liệu gộp của hai kỳ -> response. */
export function buildCustomers(
  cur: CustomerAgg,
  prev: CustomerAgg,
  range: ReturnType<typeof resolveRange>,
  now: Date,
): CustomersDto {
  const curRate = rateOf(cur.repeaters, cur.buyers);
  const prevRate = rateOf(prev.repeaters, prev.buyers);
  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: 'Asia/Ho_Chi_Minh' },
    previousRange: { from: range.previousFrom, to: range.previousTo },
    buyers: compared(cur.buyers, prev.buyers),
    firstTime: compared(cur.firstTime, prev.firstTime),
    returning: compared(cur.buyers - cur.firstTime, prev.buyers - prev.firstTime),
    repeatRate: {
      current: curRate,
      previous: prevRate,
      changePts: prev.buyers === 0 ? null : round((curRate - prevRate) * 100, 1),
    },
    firstTimeRevenue: compared(cur.firstTimeRevenue, prev.firstTimeRevenue),
    returningRevenue: compared(cur.returningRevenue, prev.returningRevenue),
    generatedAt: now.toISOString(),
  };
}

export async function getCustomers(
  query: RangeOnlyQuery,
  now: Date = new Date(),
): Promise<CustomersDto> {
  const range = resolveRange(query, vnDateKey(now));
  const prevStart = vnDayStart(range.previousFrom);
  const curStart = vnDayStart(range.from);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1));

  // Một truy vấn: gộp theo khách trên mọi đơn tính doanh thu đến hết kỳ này (cần mốc đơn đầu tiên
  // mọi thời điểm), chỉ giữ khách có đơn trong kỳ này hoặc kỳ trước rồi đếm bằng FILTER.
  const rows = await analyticsPrisma.$queryRaw<AggRow[]>`
    WITH per AS (
      SELECT
        CASE WHEN o."userId" IS NOT NULL THEN 'u:' || o."userId"
             ELSE 'g:' || lower(o."contactEmail") END AS ckey,
        MIN(o."paidAt") AS first_paid,
        COUNT(*) FILTER (WHERE o."paidAt" >= ${curStart}) AS cur_n,
        COALESCE(SUM(o."grandTotal") FILTER (WHERE o."paidAt" >= ${curStart}), 0) AS cur_rev,
        COUNT(*) FILTER (WHERE o."paidAt" >= ${prevStart} AND o."paidAt" < ${curStart}) AS prev_n,
        COALESCE(SUM(o."grandTotal") FILTER (
          WHERE o."paidAt" >= ${prevStart} AND o."paidAt" < ${curStart}), 0) AS prev_rev
      FROM "Order" o
      WHERE o."paymentStatus" = 'PAID' AND o."status" NOT IN ('CANCELLED', 'RETURNED')
        AND o."paidAt" < ${end}
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE o."paidAt" >= ${prevStart}) > 0
    )
    SELECT
      (COUNT(*) FILTER (WHERE cur_n > 0))::int AS cur_buyers,
      (COUNT(*) FILTER (WHERE cur_n > 0 AND first_paid >= ${curStart}))::int AS cur_first,
      (COUNT(*) FILTER (WHERE cur_n >= 2))::int AS cur_repeat,
      COALESCE(SUM(cur_rev) FILTER (WHERE cur_n > 0 AND first_paid >= ${curStart}), 0)::bigint
        AS cur_first_rev,
      COALESCE(SUM(cur_rev) FILTER (WHERE cur_n > 0 AND first_paid < ${curStart}), 0)::bigint
        AS cur_ret_rev,
      (COUNT(*) FILTER (WHERE prev_n > 0))::int AS prev_buyers,
      (COUNT(*) FILTER (WHERE prev_n > 0 AND first_paid >= ${prevStart}))::int AS prev_first,
      (COUNT(*) FILTER (WHERE prev_n >= 2))::int AS prev_repeat,
      COALESCE(SUM(prev_rev) FILTER (WHERE prev_n > 0 AND first_paid >= ${prevStart}), 0)::bigint
        AS prev_first_rev,
      COALESCE(SUM(prev_rev) FILTER (WHERE prev_n > 0 AND first_paid < ${prevStart}), 0)::bigint
        AS prev_ret_rev
    FROM per`;
  const r = rows[0];
  return buildCustomers(
    {
      buyers: num(r?.cur_buyers ?? 0),
      firstTime: num(r?.cur_first ?? 0),
      repeaters: num(r?.cur_repeat ?? 0),
      firstTimeRevenue: num(r?.cur_first_rev ?? 0),
      returningRevenue: num(r?.cur_ret_rev ?? 0),
    },
    {
      buyers: num(r?.prev_buyers ?? 0),
      firstTime: num(r?.prev_first ?? 0),
      repeaters: num(r?.prev_repeat ?? 0),
      firstTimeRevenue: num(r?.prev_first_rev ?? 0),
      returningRevenue: num(r?.prev_ret_rev ?? 0),
    },
    range,
    now,
  );
}
