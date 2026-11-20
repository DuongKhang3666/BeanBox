"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsCoupons, CouponsSort } from "@/types/admin";
import { getAnalyticsCoupons } from "../api/analytics";
import { deltaPct, deltaPts, formatInt, formatRate, rangeLabel } from "../analyticsRange";
import { COUPONS_BASE } from "../couponFilters";
import { adminErrorMessage } from "../errors";
import { COUPON_TYPE_LABEL } from "../labels";
import {
  BlockSkeleton,
  card,
  chip,
  DeltaCell,
  EmptyNote,
  h2,
  TableScroll,
  TD_NUM,
  TH,
  TH_NUM,
} from "./AnalyticsBreakdown";
import { Kpi } from "./AnalyticsKpi";
import { ExportCsvButton } from "./ExportCsvButton";

const linkClass =
  "font-medium text-moss-800 underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600";

const SORTS: ReadonlyArray<[CouponsSort, string, string]> = [
  ["revenue", "Theo doanh thu", "doanh thu"],
  ["uses", "Theo lượt dùng", "lượt dùng"],
  ["discount", "Theo tiền giảm", "tiền giảm"],
];

/** key = `sort|from|to|refresh`. */
function load(key: string): Promise<AnalyticsCoupons> {
  const [sort, from, to] = key.split("|") as [CouponsSort, string, string];
  return getAnalyticsCoupons({ from, to, sort });
}

export function CouponsBlock({ from, to, refresh }: { from: string; to: string; refresh: number }) {
  const [sort, setSort] = useState<CouponsSort>("revenue");
  const res = useResource<AnalyticsCoupons>(`${sort}|${from}|${to}|${refresh}`, load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải hiệu quả mã giảm giá" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được hiệu quả mã giảm giá"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const s = d.summary;
    const prevLabel = rangeLabel(d.previousRange);
    const total = s.ordersWithCoupon.current + s.ordersWithoutCoupon.current;
    const sortNoun = SORTS.find((x) => x[0] === sort)?.[2] ?? "";
    body = (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label="Đơn dùng mã"
            value={formatInt(s.ordersWithCoupon.current)}
            delta={deltaPct(s.ordersWithCoupon)}
            prevLabel={prevLabel}
            note={`Trên tổng ${formatInt(total)} đơn đã thanh toán`}
          />
          <Kpi
            label="Tỷ lệ đơn dùng mã"
            value={formatRate(s.couponRate.current)}
            delta={deltaPts(s.couponRate)}
            neutral
            prevLabel={prevLabel}
          />
          <Kpi
            label="Tổng tiền giảm"
            value={formatVND(s.totalDiscount.current)}
            delta={deltaPct(s.totalDiscount)}
            neutral
            prevLabel={prevLabel}
          />
          <Kpi
            label="Giá trị đơn TB có mã"
            value={formatVND(s.aovWithCoupon.current)}
            delta={deltaPct(s.aovWithCoupon)}
            prevLabel={prevLabel}
          />
          <Kpi
            label="Giá trị đơn TB không mã"
            value={formatVND(s.aovWithoutCoupon.current)}
            delta={deltaPct(s.aovWithoutCoupon)}
            prevLabel={prevLabel}
          />
        </div>

        {d.items.length === 0 ? (
          <EmptyNote>Chưa có đơn nào dùng mã giảm giá trong khoảng thời gian này.</EmptyNote>
        ) : (
          <TableScroll label="Bảng hiệu quả theo mã giảm giá">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="px-3 py-2 text-left text-sm text-coffee-800">
                Top {d.items.length} mã giảm giá theo {sortNoun}, {rangeLabel(d.range)}
              </caption>
              <thead className="bg-cream-100">
                <tr>
                  <th scope="col" className={TH}>
                    Mã
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Lượt dùng
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Tiền giảm
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Doanh thu
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Giá trị đơn TB
                  </th>
                  <th scope="col" className={TH}>
                    Doanh thu so với kỳ trước ({prevLabel})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-100">
                {d.items.map((c) => (
                  <tr key={c.couponId ?? `code:${c.code}`}>
                    <th scope="row" className="min-w-0 px-3 py-2 text-left font-normal">
                      {c.couponId ? (
                        <Link
                          href={`${COUPONS_BASE}/${encodeURIComponent(c.couponId)}`}
                          className={cn(linkClass, "font-mono break-all")}
                        >
                          {c.code}
                        </Link>
                      ) : (
                        <span className="font-mono font-medium break-all text-coffee-900">
                          {c.code}
                        </span>
                      )}
                      {c.deleted ? (
                        <span className="ml-2 rounded bg-coffee-100 px-1.5 py-0.5 text-xs text-coffee-800">
                          Đã xóa
                        </span>
                      ) : c.isActive === false ? (
                        <span className="ml-2 rounded bg-cream-100 px-1.5 py-0.5 text-xs text-coffee-800">
                          Đã tắt
                        </span>
                      ) : null}
                      {c.type ? (
                        <span className="block text-xs text-coffee-700">
                          {COUPON_TYPE_LABEL[c.type]}
                        </span>
                      ) : null}
                    </th>
                    <td className={TD_NUM}>{formatInt(c.uses)}</td>
                    <td className={TD_NUM}>{formatVND(c.discount)}</td>
                    <td className={TD_NUM}>{formatVND(c.revenue)}</td>
                    <td className={TD_NUM}>{formatVND(c.aov)}</td>
                    <td className="px-3 py-2">
                      <DeltaCell
                        delta={deltaPct({
                          current: c.revenue,
                          previous: c.previousRevenue,
                          changePct: c.changePct,
                        })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-coffee-700">
          <li>
            Chỉ tính đơn đã thanh toán và chưa bị hủy hoặc hoàn trả, theo ngày thanh toán. Doanh thu
            của mã là tổng giá trị đơn dùng mã (đã trừ giảm giá, gồm phí vận chuyển).
          </li>
          <li>
            Tiền giảm là giảm giá trên hàng hóa; với mã miễn phí vận chuyển là phần phí ship được
            miễn. Mã đã xóa vẫn được tính theo mã lưu trên đơn (không biết loại mã nên chỉ tính giảm
            giá trên hàng hóa).
          </li>
        </ul>
      </div>
    );
  }

  return (
    <section aria-labelledby="an-coupons" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-coupons" className={h2}>
          Mã giảm giá
        </h2>
        <ExportCsvButton
          params={{ report: "coupons", from, to, sort }}
          context="hiệu quả mã giảm giá"
        />
      </div>
      <div role="group" aria-label="Sắp xếp mã giảm giá" className="flex flex-wrap gap-2">
        {SORTS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            className={chip(sort === id)}
            onClick={() => setSort(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
    </section>
  );
}
