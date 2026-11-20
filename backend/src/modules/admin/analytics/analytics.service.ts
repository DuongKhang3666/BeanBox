import { prisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import {
  buildBuckets,
  dayNum,
  resolveRange,
  ymdOf,
  type Bucket,
  type Granularity,
  type ResolvedRange,
} from './analytics.range.js';
import type { OverviewQuery } from './analytics.schema.js';

/** Phân tích kinh doanh, chỉ Admin (api-contract §16, D-049/D-050). */

const TIMEZONE = 'Asia/Ho_Chi_Minh';

export interface Compared {
  current: number;
  previous: number;
  changePct: number | null;
}
export interface ComparedRate {
  current: number;
  previous: number;
  changePts: number | null;
}
export interface SeriesPoint {
  start: string;
  end: string;
  revenue: number;
  paidOrders: number;
  ordersPlaced: number;
}
export interface OverviewDto {
  range: { from: string; to: string; days: number; granularity: Granularity; timezone: string };
  previousRange: { from: string; to: string };
  kpis: {
    revenue: Compared;
    paidOrders: Compared;
    aov: Compared;
    ordersPlaced: Compared;
    cancelledOrders: Compared;
    cancelRate: ComparedRate;
    discountTotal: Compared;
    refundedAmount: Compared;
    newCustomers: Compared;
  };
  series: SeriesPoint[];
  previousSeries: SeriesPoint[];
  generatedAt: string;
}

/** Số liệu theo ngày VN (`d` = YYYY-MM-DD); mỗi truy vấn tổng hợp bằng SQL GROUP BY ngày. */
export interface DayRows {
  paid: Array<{ d: string; revenue: number; n: number; discount: number }>;
  created: Array<{ d: string; n: number; cancelled: number }>;
  refunds: Array<{ d: string; amount: number }>;
  customers: Array<{ d: string; n: number }>;
}

interface Totals {
  revenue: number;
  paidOrders: number;
  discount: number;
  placed: number;
  cancelled: number;
  refunded: number;
  newCustomers: number;
}

export const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** % thay đổi, 1 chữ số thập phân; null khi kỳ trước = 0. */
export function changePct(current: number, previous: number): number | null {
  return previous === 0 ? null : round(((current - previous) / previous) * 100, 1);
}

export const compared = (current: number, previous: number): Compared => ({
  current,
  previous,
  changePct: changePct(current, previous),
});

const aovOf = (revenue: number, paid: number) => (paid > 0 ? Math.round(revenue / paid) : 0);

function totalsFor(rows: DayRows, from: string, to: string): Totals {
  const inRange = (d: string) => d >= from && d <= to;
  const t: Totals = {
    revenue: 0,
    paidOrders: 0,
    discount: 0,
    placed: 0,
    cancelled: 0,
    refunded: 0,
    newCustomers: 0,
  };
  for (const r of rows.paid) {
    if (!inRange(r.d)) continue;
    t.revenue += r.revenue;
    t.paidOrders += r.n;
    t.discount += r.discount;
  }
  for (const r of rows.created) {
    if (!inRange(r.d)) continue;
    t.placed += r.n;
    t.cancelled += r.cancelled;
  }
  for (const r of rows.refunds) if (inRange(r.d)) t.refunded += r.amount;
  for (const r of rows.customers) if (inRange(r.d)) t.newCustomers += r.n;
  return t;
}

function seriesFor(rows: DayRows, buckets: Bucket[]): SeriesPoint[] {
  const out = buckets.map((b) => ({ ...b, revenue: 0, paidOrders: 0, ordersPlaced: 0 }));
  // Ánh xạ ngày -> chỉ số bucket (bucket phủ liên tục, không chồng nhau).
  const idx = new Map<string, number>();
  buckets.forEach((b, i) => {
    for (let n = dayNum(b.start); n <= dayNum(b.end); n++) idx.set(ymdOf(n), i);
  });
  for (const r of rows.paid) {
    const p = out[idx.get(r.d) ?? -1];
    if (p) {
      p.revenue += r.revenue;
      p.paidOrders += r.n;
    }
  }
  for (const r of rows.created) {
    const p = out[idx.get(r.d) ?? -1];
    if (p) p.ordersPlaced += r.n;
  }
  return out;
}

const rate = (cancelled: number, placed: number) => (placed > 0 ? round(cancelled / placed, 4) : 0);

/** Hàm thuần: gom số liệu theo ngày thành response (kiểm thử không cần DB). */
export function buildOverview(rows: DayRows, range: ResolvedRange, now: Date): OverviewDto {
  const cur = totalsFor(rows, range.from, range.to);
  const prev = totalsFor(rows, range.previousFrom, range.previousTo);
  const curRate = rate(cur.cancelled, cur.placed);
  const prevRate = rate(prev.cancelled, prev.placed);
  return {
    range: {
      from: range.from,
      to: range.to,
      days: range.days,
      granularity: range.granularity,
      timezone: TIMEZONE,
    },
    previousRange: { from: range.previousFrom, to: range.previousTo },
    kpis: {
      revenue: compared(cur.revenue, prev.revenue),
      paidOrders: compared(cur.paidOrders, prev.paidOrders),
      aov: compared(aovOf(cur.revenue, cur.paidOrders), aovOf(prev.revenue, prev.paidOrders)),
      ordersPlaced: compared(cur.placed, prev.placed),
      cancelledOrders: compared(cur.cancelled, prev.cancelled),
      cancelRate: {
        current: curRate,
        previous: prevRate,
        changePts: prev.placed === 0 ? null : round((curRate - prevRate) * 100, 1),
      },
      discountTotal: compared(cur.discount, prev.discount),
      refundedAmount: compared(cur.refunded, prev.refunded),
      newCustomers: compared(cur.newCustomers, prev.newCustomers),
    },
    series: seriesFor(rows, buildBuckets(range.from, range.to, range.granularity)),
    previousSeries: seriesFor(
      rows,
      buildBuckets(range.previousFrom, range.previousTo, range.granularity),
    ),
    generatedAt: now.toISOString(),
  };
}

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

export async function getOverview(
  query: OverviewQuery,
  now: Date = new Date(),
): Promise<OverviewDto> {
  const range = resolveRange(query, vnDateKey(now));
  const start = vnDayStart(range.previousFrom);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1)); // loại trừ

  // Một truy vấn mỗi nguồn trên [kỳ trước + kỳ này], GROUP BY ngày VN; tham số hóa, không N+1.
  const [paid, created, refunds, customers] = await Promise.all([
    // Doanh thu theo paidAt, định nghĩa D-019.
    prisma.$queryRaw<Array<{ d: string; revenue: Raw; n: Raw; discount: Raw }>>`
      SELECT to_char("paidAt" + interval '7 hours', 'YYYY-MM-DD') AS d,
             SUM("grandTotal")::bigint AS revenue, COUNT(*)::int AS n,
             SUM("discountTotal")::bigint AS discount
      FROM "Order"
      WHERE "paymentStatus" = 'PAID'
        AND "status" NOT IN ('CANCELLED', 'RETURNED')
        AND "paidAt" >= ${start} AND "paidAt" < ${end}
      GROUP BY d`,
    prisma.$queryRaw<Array<{ d: string; n: Raw; cancelled: Raw }>>`
      SELECT to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') AS d,
             COUNT(*)::int AS n,
             (COUNT(*) FILTER (WHERE "status" = 'CANCELLED'))::int AS cancelled
      FROM "Order"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY d`,
    prisma.$queryRaw<Array<{ d: string; amount: Raw }>>`
      SELECT to_char("refundedAt" + interval '7 hours', 'YYYY-MM-DD') AS d,
             SUM("amount")::bigint AS amount
      FROM "Payment"
      WHERE "refundedAt" >= ${start} AND "refundedAt" < ${end}
      GROUP BY d`,
    prisma.$queryRaw<Array<{ d: string; n: Raw }>>`
      SELECT to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
      FROM "User"
      WHERE "role" = 'CUSTOMER' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY d`,
  ]);

  return buildOverview(
    {
      paid: paid.map((r) => ({
        d: r.d,
        revenue: num(r.revenue),
        n: num(r.n),
        discount: num(r.discount),
      })),
      created: created.map((r) => ({ d: r.d, n: num(r.n), cancelled: num(r.cancelled) })),
      refunds: refunds.map((r) => ({ d: r.d, amount: num(r.amount) })),
      customers: customers.map((r) => ({ d: r.d, n: num(r.n) })),
    },
    range,
    now,
  );
}
