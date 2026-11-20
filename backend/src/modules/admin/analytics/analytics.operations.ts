import { EXPIRE_REASON } from '../../../jobs/cleanup.js';
import { prisma } from '../../../lib/prisma.js';
import { vnDayStart } from '../admin.schema.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { ordersNeedingRefund } from '../orders/orders.service.js';
import { dayNum, resolveRange, ymdOf } from './analytics.range.js';
import type { RangeOnlyQuery } from './analytics.schema.js';
import { compared, round, type Compared, type ComparedRate } from './analytics.service.js';

/**
 * Vận hành: phân loại hủy, trả hàng, hoàn tiền, thời gian xử lý, đơn cần xử lý
 * (api-contract §16.3, D-052). Mọi truy vấn là SQL tham số hóa, không N+1.
 */

type Raw = bigint | number | null;
const num = (v: Raw) => Number(v ?? 0);

export const CANCEL_TYPES = ['customer', 'store', 'expired', 'unknown'] as const;
export type CancelType = (typeof CANCEL_TYPES)[number];

export const CANCEL_LABELS: Record<CancelType, string> = {
  customer: 'Khách hủy',
  store: 'Cửa hàng hủy',
  expired: 'Hết hạn thanh toán',
  unknown: 'Không rõ',
};

export const PENDING_OVER_HOURS = 24;
export const PENDING_OLDEST_LIMIT = 10;
const HOUR_MS = 3600 * 1000;

export interface HoursStat {
  /** Giờ, 1 chữ số thập phân; null khi n = 0. */
  avg: number | null;
  median: number | null;
  n: number;
  previousAvg: number | null;
}

export interface OperationsDto {
  range: { from: string; to: string; days: number; timezone: string };
  previousRange: { from: string; to: string };
  cancellations: {
    total: Compared;
    byType: Array<{ type: CancelType; label: string; current: number; previous: number }>;
  };
  returns: { delivered: Compared; returned: Compared; rate: ComparedRate };
  refunds: { count: Compared; amount: Compared };
  fulfillment: { confirmHours: HoursStat; deliveryHours: HoursStat };
  attention: {
    pendingOver24h: {
      count: number;
      oldest: Array<{ code: string; createdAt: string; grandTotal: number; waitingHours: number }>;
    };
    needsRefund: number;
    returnRequested: number;
    failedDelivery: number;
  };
  generatedAt: string;
}

const rate = (n: number, d: number) => (d > 0 ? round(n / d, 4) : 0);
const hours1 = (v: Raw | string | undefined) =>
  v === null || v === undefined ? null : round(Number(v), 1);

interface CancelRow {
  is_cur: boolean;
  type: CancelType;
  n: Raw;
}
interface ReturnRow {
  del_cur: Raw;
  ret_cur: Raw;
  del_prev: Raw;
  ret_prev: Raw;
}
interface RefundRow {
  n_cur: Raw;
  amt_cur: Raw;
  n_prev: Raw;
  amt_prev: Raw;
}
interface FulfillRow {
  confirm_avg: Raw | string;
  confirm_median: Raw | string;
  confirm_n: Raw;
  confirm_prev_avg: Raw | string;
  delivery_avg: Raw | string;
  delivery_median: Raw | string;
  delivery_n: Raw;
  delivery_prev_avg: Raw | string;
}
interface PendingRow {
  code: string;
  createdAt: Date;
  grandTotal: number;
  total: Raw;
}

export async function getOperations(
  query: RangeOnlyQuery,
  now: Date = new Date(),
): Promise<OperationsDto> {
  const range = resolveRange(query, vnDateKey(now));
  const prevStart = vnDayStart(range.previousFrom);
  const curStart = vnDayStart(range.from);
  const end = vnDayStart(ymdOf(dayNum(range.to) + 1));
  const pendingBefore = new Date(now.getTime() - PENDING_OVER_HOURS * HOUR_MS);

  const [cancelRows, returnRows, refundRows, fulfillRows, pendingRows, statusCounts, refundIds] =
    await Promise.all([
      // Đơn TẠO trong kỳ đang CANCELLED, phân loại theo dòng lịch sử toStatus = CANCELLED mới nhất
      // (index [orderId, createdAt]); role là role HIỆN TẠI của actor (D-052).
      prisma.$queryRaw<CancelRow[]>`
        SELECT (o."createdAt" >= ${curStart}) AS is_cur,
          CASE
            WHEN h."id" IS NULL THEN 'unknown'
            WHEN h."actorId" IS NULL AND h."fromStatus" = 'PENDING_PAYMENT'
              AND h."note" = ${EXPIRE_REASON} THEN 'expired'
            WHEN u."role" IN ('STAFF', 'ADMIN') THEN 'store'
            ELSE 'customer'
          END AS type,
          COUNT(*)::int AS n
        FROM "Order" o
        LEFT JOIN LATERAL (
          SELECT hh."id", hh."actorId", hh."fromStatus", hh."note"
          FROM "OrderStatusHistory" hh
          WHERE hh."orderId" = o."id" AND hh."toStatus" = 'CANCELLED'
          ORDER BY hh."createdAt" DESC, hh."id" DESC
          LIMIT 1
        ) h ON true
        LEFT JOIN "User" u ON u."id" = h."actorId"
        WHERE o."status" = 'CANCELLED' AND o."createdAt" >= ${prevStart} AND o."createdAt" < ${end}
        GROUP BY 1, 2`,
      prisma.$queryRaw<ReturnRow[]>`
        SELECT
          (COUNT(*) FILTER (WHERE "deliveredAt" >= ${curStart}))::int AS del_cur,
          (COUNT(*) FILTER (WHERE "deliveredAt" >= ${curStart} AND "status" = 'RETURNED'))::int AS ret_cur,
          (COUNT(*) FILTER (WHERE "deliveredAt" < ${curStart}))::int AS del_prev,
          (COUNT(*) FILTER (WHERE "deliveredAt" < ${curStart} AND "status" = 'RETURNED'))::int AS ret_prev
        FROM "Order"
        WHERE "deliveredAt" >= ${prevStart} AND "deliveredAt" < ${end}`,
      prisma.$queryRaw<RefundRow[]>`
        SELECT
          (COUNT(*) FILTER (WHERE "refundedAt" >= ${curStart}))::int AS n_cur,
          COALESCE(SUM("amount") FILTER (WHERE "refundedAt" >= ${curStart}), 0)::bigint AS amt_cur,
          (COUNT(*) FILTER (WHERE "refundedAt" < ${curStart}))::int AS n_prev,
          COALESCE(SUM("amount") FILTER (WHERE "refundedAt" < ${curStart}), 0)::bigint AS amt_prev
        FROM "Payment"
        WHERE "refundedAt" >= ${prevStart} AND "refundedAt" < ${end}`,
      // Giờ = giây / 3600. Xác nhận: chỉ đơn COD (đơn online tự xác nhận khi thanh toán).
      // Giao: confirmedAt -> deliveredAt. Trung vị = percentile_cont(0.5).
      prisma.$queryRaw<FulfillRow[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("confirmedAt" - "createdAt")) / 3600.0)
            FILTER (WHERE "paymentMethod" = 'COD' AND "confirmedAt" >= ${curStart} AND "confirmedAt" < ${end})
            AS confirm_avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("confirmedAt" - "createdAt")) / 3600.0)
            FILTER (WHERE "paymentMethod" = 'COD' AND "confirmedAt" >= ${curStart} AND "confirmedAt" < ${end})
            AS confirm_median,
          (COUNT(*) FILTER (WHERE "paymentMethod" = 'COD' AND "confirmedAt" >= ${curStart} AND "confirmedAt" < ${end}))::int
            AS confirm_n,
          AVG(EXTRACT(EPOCH FROM ("confirmedAt" - "createdAt")) / 3600.0)
            FILTER (WHERE "paymentMethod" = 'COD' AND "confirmedAt" >= ${prevStart} AND "confirmedAt" < ${curStart})
            AS confirm_prev_avg,
          AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "confirmedAt")) / 3600.0)
            FILTER (WHERE "confirmedAt" IS NOT NULL AND "deliveredAt" >= ${curStart} AND "deliveredAt" < ${end})
            AS delivery_avg,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("deliveredAt" - "confirmedAt")) / 3600.0)
            FILTER (WHERE "confirmedAt" IS NOT NULL AND "deliveredAt" >= ${curStart} AND "deliveredAt" < ${end})
            AS delivery_median,
          (COUNT(*) FILTER (WHERE "confirmedAt" IS NOT NULL AND "deliveredAt" >= ${curStart} AND "deliveredAt" < ${end}))::int
            AS delivery_n,
          AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "confirmedAt")) / 3600.0)
            FILTER (WHERE "confirmedAt" IS NOT NULL AND "deliveredAt" >= ${prevStart} AND "deliveredAt" < ${curStart})
            AS delivery_prev_avg
        FROM "Order"
        WHERE ("confirmedAt" >= ${prevStart} AND "confirmedAt" < ${end})
           OR ("deliveredAt" >= ${prevStart} AND "deliveredAt" < ${end})`,
      // Ảnh chụp hiện tại: đơn PENDING quá 24 giờ, cũ nhất trước.
      prisma.$queryRaw<PendingRow[]>`
        SELECT "code", "createdAt", "grandTotal", (COUNT(*) OVER ())::int AS total
        FROM "Order"
        WHERE "status" = 'PENDING' AND "createdAt" < ${pendingBefore}
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT ${PENDING_OLDEST_LIMIT}`,
      prisma.order.groupBy({
        by: ['status'],
        where: { status: { in: ['RETURN_REQUESTED', 'FAILED_DELIVERY'] } },
        _count: { _all: true },
      }),
      ordersNeedingRefund(),
    ]);

  const typeCounts = new Map<string, number>();
  let curTotal = 0;
  let prevTotal = 0;
  for (const r of cancelRows) {
    const n = num(r.n);
    typeCounts.set(`${r.is_cur ? 'c' : 'p'}:${r.type}`, n);
    if (r.is_cur) curTotal += n;
    else prevTotal += n;
  }

  const ret = returnRows[0];
  const delCur = num(ret?.del_cur ?? 0);
  const retCur = num(ret?.ret_cur ?? 0);
  const delPrev = num(ret?.del_prev ?? 0);
  const retPrev = num(ret?.ret_prev ?? 0);
  const retRateCur = rate(retCur, delCur);
  const retRatePrev = rate(retPrev, delPrev);

  const rf = refundRows[0];
  const ful = fulfillRows[0];
  const stat = (
    avg: Raw | string | undefined,
    median: Raw | string | undefined,
    n: Raw | undefined,
    prevAvg: Raw | string | undefined,
  ): HoursStat => {
    const count = num(n ?? 0);
    return {
      avg: count > 0 ? hours1(avg) : null,
      median: count > 0 ? hours1(median) : null,
      n: count,
      previousAvg: hours1(prevAvg),
    };
  };

  const statusCount = (s: string) => statusCounts.find((g) => g.status === s)?._count._all ?? 0;

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: 'Asia/Ho_Chi_Minh' },
    previousRange: { from: range.previousFrom, to: range.previousTo },
    cancellations: {
      total: compared(curTotal, prevTotal),
      byType: CANCEL_TYPES.map((type) => ({
        type,
        label: CANCEL_LABELS[type],
        current: typeCounts.get(`c:${type}`) ?? 0,
        previous: typeCounts.get(`p:${type}`) ?? 0,
      })),
    },
    returns: {
      delivered: compared(delCur, delPrev),
      returned: compared(retCur, retPrev),
      rate: {
        current: retRateCur,
        previous: retRatePrev,
        changePts: delPrev === 0 ? null : round((retRateCur - retRatePrev) * 100, 1),
      },
    },
    refunds: {
      count: compared(num(rf?.n_cur ?? 0), num(rf?.n_prev ?? 0)),
      amount: compared(num(rf?.amt_cur ?? 0), num(rf?.amt_prev ?? 0)),
    },
    fulfillment: {
      confirmHours: stat(
        ful?.confirm_avg,
        ful?.confirm_median,
        ful?.confirm_n,
        ful?.confirm_prev_avg,
      ),
      deliveryHours: stat(
        ful?.delivery_avg,
        ful?.delivery_median,
        ful?.delivery_n,
        ful?.delivery_prev_avg,
      ),
    },
    attention: {
      pendingOver24h: {
        count: pendingRows.length > 0 ? num(pendingRows[0]!.total) : 0,
        oldest: pendingRows.map((r) => ({
          code: r.code,
          createdAt: r.createdAt.toISOString(),
          grandTotal: r.grandTotal,
          waitingHours: Math.floor((now.getTime() - r.createdAt.getTime()) / HOUR_MS),
        })),
      },
      needsRefund: refundIds.length,
      returnRequested: statusCount('RETURN_REQUESTED'),
      failedDelivery: statusCount('FAILED_DELIVERY'),
    },
    generatedAt: now.toISOString(),
  };
}
