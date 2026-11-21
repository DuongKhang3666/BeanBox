"use client";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsBreakdown, AnalyticsCompared, BreakdownDimension } from "@/types/admin";
import { getAnalyticsBreakdown } from "../api/analytics";
import {
  BREAKDOWN_DIMS,
  deltaPct,
  formatInt,
  formatRate,
  rangeLabel,
  type Delta,
} from "../analyticsRange";
import { adminErrorMessage } from "../errors";
import { ExportCsvButton } from "./ExportCsvButton";

export const card =
  "rounded-2xl border border-coffee-200 bg-white p-4 print:break-inside-avoid print:rounded-lg print:border-coffee-400";
export const h2 = "scroll-mt-20 font-serif text-lg font-bold text-coffee-900";
export const chip = (active: boolean) =>
  cn(
    "inline-flex h-11 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600",
    active
      ? "border-moss-800 bg-moss-800 text-white"
      : "border-coffee-300 bg-white text-coffee-900 hover:bg-cream-100",
  );
export const TH = "px-3 py-2 text-left text-xs font-semibold tracking-wide text-coffee-700";
export const TH_NUM = `${TH} text-right`;
export const TD_NUM = "px-3 py-2 text-right tabular-nums";

export function BlockSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-2">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-cream-100 px-3 py-3 text-sm text-coffee-800" role="status">
      {children}
    </p>
  );
}

/** Vùng cuộn ngang của bảng rộng: focus được, `relative` (D-048). */
export function TableScroll({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative overflow-x-auto rounded-xl border border-coffee-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 print:overflow-visible"
    >
      {children}
    </div>
  );
}

export function DeltaCell({ delta }: { delta: Delta }) {
  if (delta.direction === "none") {
    return <span className="text-coffee-700">{delta.visual}</span>;
  }
  const tone =
    delta.direction === "flat"
      ? "text-coffee-800"
      : delta.direction === "up"
        ? "text-moss-800"
        : "text-danger-600";
  return (
    <span className={cn("font-semibold", tone)}>
      <span aria-hidden="true">{delta.visual}</span>
      <span className="sr-only">{delta.spoken}</span>
    </span>
  );
}

const compared = (current: number, previous: number, pct: number | null): AnalyticsCompared => ({
  current,
  previous,
  changePct: pct,
});

/** key = `dim|from|to|refresh`. */
function load(key: string): Promise<AnalyticsBreakdown> {
  const [dimension, from, to] = key.split("|") as [BreakdownDimension, string, string];
  return getAnalyticsBreakdown({ dimension, from, to });
}

export function BreakdownBlock({
  from,
  to,
  dim,
  onDim,
  refresh,
}: {
  from: string;
  to: string;
  dim: BreakdownDimension;
  onDim: (d: BreakdownDimension) => void;
  refresh: number;
}) {
  const res = useResource<AnalyticsBreakdown>(`${dim}|${from}|${to}|${refresh}`, load);
  const dimLabel = BREAKDOWN_DIMS.find((d) => d.id === dim)?.label ?? "";

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải cơ cấu doanh thu" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được cơ cấu doanh thu"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const isItem = d.basis === "item";
    const classified = d.dimension === "category" || d.dimension === "brand";
    const prevLabel = rangeLabel(d.previousRange);
    if (d.groups.length === 0) {
      body = <EmptyNote>Chưa có doanh thu nào trong khoảng thời gian này.</EmptyNote>;
    } else {
      const totalDelta = deltaPct(
        compared(
          d.total.revenue,
          d.previousTotal.revenue,
          d.previousTotal.revenue === 0
            ? null
            : Math.round(
                ((d.total.revenue - d.previousTotal.revenue) / d.previousTotal.revenue) * 1000,
              ) / 10,
        ),
      );
      body = (
        <div className="space-y-3">
          <TableScroll label={`Bảng doanh thu theo ${dimLabel.toLowerCase()}`}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="px-3 py-2 text-left text-sm text-coffee-800">
                Doanh thu theo {dimLabel.toLowerCase()}, {rangeLabel(d.range)} ({d.groups.length}{" "}
                nhóm)
              </caption>
              <thead className="bg-cream-100">
                <tr>
                  <th scope="col" className={TH}>
                    {dimLabel}
                  </th>
                  <th scope="col" className={TH_NUM}>
                    {isItem ? "Doanh thu hàng hóa" : "Doanh thu"}
                  </th>
                  <th scope="col" className={`${TH} min-w-40`}>
                    Tỷ trọng
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Số đơn
                  </th>
                  {isItem ? (
                    <th scope="col" className={TH_NUM}>
                      Số lượng
                    </th>
                  ) : null}
                  <th scope="col" className={TH}>
                    So với kỳ trước ({prevLabel})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-100">
                {d.groups.map((g) => (
                  <tr key={g.key ?? "__null__"}>
                    <th scope="row" className="px-3 py-2 text-left font-medium break-words">
                      {g.label}
                    </th>
                    <td className={TD_NUM}>{formatVND(g.revenue)}</td>
                    <td className="px-3 py-2">
                      <span className="tabular-nums">{formatRate(g.share)}</span>
                      <div
                        aria-hidden="true"
                        className="mt-1 h-2 w-full overflow-hidden rounded bg-cream-100"
                      >
                        <div
                          className="h-2 rounded bg-moss-600"
                          style={{ width: `${Math.round(g.share * 1000) / 10}%` }}
                        />
                      </div>
                    </td>
                    <td className={TD_NUM}>{formatInt(g.orders)}</td>
                    {isItem ? <td className={TD_NUM}>{formatInt(g.quantity ?? 0)}</td> : null}
                    <td className="px-3 py-2">
                      <DeltaCell
                        delta={deltaPct(compared(g.revenue, g.previousRevenue, g.changePct))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-coffee-200 bg-cream-50 font-semibold">
                <tr>
                  <th scope="row" className="px-3 py-2 text-left">
                    Tổng
                  </th>
                  <td className={TD_NUM}>{formatVND(d.total.revenue)}</td>
                  <td className="px-3 py-2 tabular-nums">{d.total.revenue > 0 ? "100%" : "0%"}</td>
                  <td className={TD_NUM}>{formatInt(d.total.orders)}</td>
                  {isItem ? <td className={TD_NUM}>{formatInt(d.total.quantity ?? 0)}</td> : null}
                  <td className="px-3 py-2">
                    <DeltaCell delta={totalDelta} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </TableScroll>
          <ul className="list-disc space-y-1 pl-5 text-xs text-coffee-700">
            {isItem ? (
              <>
                <li>
                  Doanh thu hàng hóa, chưa trừ giảm giá cấp đơn và phí vận chuyển; một đơn có thể
                  thuộc nhiều nhóm nên số đơn của các nhóm không cộng lại thành tổng.
                </li>
                {classified ? (
                  <li>
                    Phân loại theo {dim === "category" ? "danh mục" : "thương hiệu"} hiện tại của
                    sản phẩm: nếu sản phẩm được chuyển nhóm thì số liệu quá khứ cũng chuyển theo.
                  </li>
                ) : null}
              </>
            ) : (
              <li>
                Doanh thu theo giá trị đơn (đã gồm phí vận chuyển, đã trừ giảm giá); tổng các nhóm
                bằng doanh thu ở phần tổng quan.
              </li>
            )}
            {d.groups.some((g) => g.key === "__other__") ? (
              <li>“Khác” gộp các nhóm nhỏ còn lại; chỉ hiển thị tối đa 50 nhóm.</li>
            ) : null}
          </ul>
        </div>
      );
    }
  }

  return (
    <section aria-labelledby="an-breakdown" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-breakdown" tabIndex={-1} className={h2}>
          Cơ cấu doanh thu
        </h2>
        <ExportCsvButton
          params={{ report: "breakdown", dimension: dim, from, to }}
          context={`cơ cấu doanh thu theo ${dimLabel.toLowerCase()}`}
        />
      </div>
      <div role="group" aria-label="Chiều phân tích" className="flex flex-wrap gap-2 print:hidden">
        {BREAKDOWN_DIMS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={dim === o.id}
            className={chip(dim === o.id)}
            onClick={() => onDim(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {body}
    </section>
  );
}
