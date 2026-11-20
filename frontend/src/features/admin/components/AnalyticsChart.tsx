"use client";

import { useState, type KeyboardEvent } from "react";
import { formatVND } from "@/lib/format";
import type { AnalyticsGranularity, AnalyticsPoint } from "@/types/admin";
import { formatInt, rangeLabel, shortDate } from "../analyticsRange";

const GRAN_NOUN: Record<AnalyticsGranularity, string> = {
  day: "ngày",
  week: "tuần",
  month: "tháng",
};

/** Nhãn một bucket: ngày "13/10"; tuần/khoảng "13/10–19/10"; tháng "10/2026". */
export function bucketLabel(p: AnalyticsPoint, g: AnalyticsGranularity): string {
  if (g === "month") return `${p.start.slice(5, 7)}/${p.start.slice(0, 4)}`;
  if (p.start === p.end) return shortDate(p.start);
  return rangeLabel({ from: p.start, to: p.end });
}

/** Số tiền rút gọn cho trục: 1,2tr / 350k / 2 tỷ. */
export function compactVND(n: number): string {
  const f = (v: number, unit: string) =>
    `${String(Math.round(v * 10) / 10).replace(".", ",")}${unit}`;
  if (n >= 1e9) return f(n / 1e9, " tỷ");
  if (n >= 1e6) return f(n / 1e6, "tr");
  if (n >= 1e3) return f(n / 1e3, "k");
  return String(n);
}

function describe(p: AnalyticsPoint, prev: AnalyticsPoint | undefined, g: AnalyticsGranularity) {
  const base = `${bucketLabel(p, g)}: doanh thu ${formatVND(p.revenue)}, ${p.paidOrders} đơn đã thanh toán, ${p.ordersPlaced} đơn đã đặt`;
  return prev ? `${base}. Kỳ trước (${bucketLabel(prev, g)}): ${formatVND(prev.revenue)}` : base;
}

const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

/**
 * Biểu đồ cột doanh thu bằng SVG tự vẽ (D-019/D-049, không thư viện). Cột = kỳ hiện tại, đường nét
 * đứt = kỳ trước (căn theo chỉ số bucket). Vùng cuộn ngang focus được: mũi tên trái/phải đổi cột
 * đang xem; rê chuột cũng hiện chi tiết. Dữ liệu đầy đủ luôn có ở bảng thay thế.
 */
export function AnalyticsChart({
  series,
  previousSeries,
  granularity,
  summary,
}: {
  series: AnalyticsPoint[];
  previousSeries: AnalyticsPoint[];
  granularity: AnalyticsGranularity;
  summary: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = series.length;
  const step = Math.max(22, Math.min(80, Math.floor(820 / Math.max(n, 1))));
  const plotW = n * step;
  const W = PAD.left + plotW + PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...series.map((p) => p.revenue), ...previousSeries.map((p) => p.revenue));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const barW = Math.max(6, step * 0.6);
  const labelEvery = Math.max(1, Math.ceil(54 / step));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const shown = active !== null ? series[active] : undefined;
  const prevPoints = previousSeries.slice(0, n);
  const linePath = prevPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${PAD.left + i * step + step / 2},${y(p.revenue)}`)
    .join(" ");

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return;
    const cur = active ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur === -1 ? 0 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  }

  return (
    <div className="space-y-2">
      <p
        className="min-h-10 text-sm text-coffee-800 sm:min-h-5"
        aria-live="polite"
        data-testid="analytics-tooltip"
      >
        {shown
          ? describe(shown, previousSeries[active!], granularity)
          : "Rê chuột hoặc chọn biểu đồ rồi nhấn mũi tên trái/phải để xem từng cột."}
      </p>
      <div className="flex flex-wrap gap-4 text-xs text-coffee-800" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-moss-600" /> Kỳ này
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-coffee-600" /> Kỳ
          trước
        </span>
      </div>
      <div
        role="group"
        aria-label={`Biểu đồ doanh thu theo ${GRAN_NOUN[granularity]}. Dùng mũi tên trái phải để xem từng cột.`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative overflow-x-auto rounded-xl border border-coffee-100 bg-cream-50 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
      >
        <svg
          role="img"
          aria-label={summary}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => {
            const v = max * t;
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(v)}
                  y2={y(v)}
                  className="stroke-coffee-100"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={y(v) + 4}
                  textAnchor="end"
                  className="fill-coffee-700"
                  fontSize={11}
                >
                  {compactVND(Math.round(v))}
                </text>
              </g>
            );
          })}
          {series.map((p, i) => {
            const top = y(p.revenue);
            const h = Math.max(p.revenue > 0 ? 2 : 1, PAD.top + plotH - top);
            const x = PAD.left + i * step + (step - barW) / 2;
            return (
              <g key={`${p.start}-${p.end}`}>
                <rect
                  x={PAD.left + i * step}
                  y={PAD.top}
                  width={step}
                  height={plotH + PAD.bottom}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                />
                <rect
                  x={x}
                  y={PAD.top + plotH - h}
                  width={barW}
                  height={h}
                  rx={2}
                  className={
                    p.revenue === 0
                      ? "fill-coffee-200"
                      : active === i
                        ? "fill-moss-800"
                        : "fill-moss-600"
                  }
                />
                {i % labelEvery === 0 ? (
                  <text
                    x={PAD.left + i * step + step / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-coffee-700"
                    fontSize={11}
                  >
                    {granularity === "month" ? bucketLabel(p, granularity) : shortDate(p.start)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {prevPoints.length > 0 ? (
            <g>
              <path
                d={linePath}
                fill="none"
                className="stroke-coffee-600"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              {prevPoints.map((p, i) => (
                <circle
                  key={`${p.start}-${p.end}`}
                  cx={PAD.left + i * step + step / 2}
                  cy={y(p.revenue)}
                  r={2.5}
                  className="fill-coffee-600"
                />
              ))}
            </g>
          ) : null}
          {active !== null ? (
            <rect
              x={PAD.left + active * step}
              y={PAD.top}
              width={step}
              height={plotH}
              fill="none"
              className="stroke-moss-800"
              strokeWidth={1}
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

/** Bảng dữ liệu thay thế cho biểu đồ (a11y): cùng số liệu, đọc được bằng trình đọc màn hình. */
export function AnalyticsTable({
  series,
  previousSeries,
  granularity,
  caption,
}: {
  series: AnalyticsPoint[];
  previousSeries: AnalyticsPoint[];
  granularity: AnalyticsGranularity;
  caption: string;
}) {
  const th = "px-3 py-2 text-left text-xs font-semibold text-coffee-800";
  const td = "px-3 py-1.5 text-right tabular-nums";
  return (
    <div
      className="relative max-h-96 overflow-auto rounded-lg border border-coffee-200"
      tabIndex={0}
      role="group"
      aria-label="Bảng số liệu, có thể cuộn"
    >
      <table className="min-w-full text-sm">
        <caption className="px-3 py-2 text-left text-sm text-coffee-800">{caption}</caption>
        <thead className="sticky top-0 bg-cream-100">
          <tr>
            <th scope="col" className={th}>
              {granularity === "month" ? "Tháng" : granularity === "week" ? "Tuần" : "Ngày"}
            </th>
            <th scope="col" className={`${th} text-right`}>
              Doanh thu
            </th>
            <th scope="col" className={`${th} text-right`}>
              Đơn đã thanh toán
            </th>
            <th scope="col" className={`${th} text-right`}>
              Đơn đã đặt
            </th>
            <th scope="col" className={`${th} text-right`}>
              Doanh thu kỳ trước
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {series.map((p, i) => (
            <tr key={`${p.start}-${p.end}`}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                {bucketLabel(p, granularity)}
              </th>
              <td className={td}>{formatVND(p.revenue)}</td>
              <td className={td}>{formatInt(p.paidOrders)}</td>
              <td className={td}>{formatInt(p.ordersPlaced)}</td>
              <td className={td}>
                {previousSeries[i] ? formatVND(previousSeries[i].revenue) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
