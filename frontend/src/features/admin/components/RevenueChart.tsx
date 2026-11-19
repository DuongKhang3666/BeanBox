"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { DashboardDay } from "@/types/admin";

/** "2026-10-13" -> "13/10". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${d}/${m}` : iso;
}

export function dayLabel(day: DashboardDay): string {
  return `${shortDate(day.date)}: doanh thu ${formatVND(day.revenue)}, ${day.orders} đơn`;
}

/**
 * Biểu đồ cột doanh thu bằng CSS thuần (D-019, không thư viện). Mỗi cột focus được và có aria-label;
 * tooltip hiện khi hover/focus. Khung cuộn ngang trên màn hẹp để không tràn trang.
 */
export function RevenueChart({ days }: { days: DashboardDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const shown = active !== null ? days[active] : undefined;

  return (
    <div role="group" aria-label="Biểu đồ doanh thu 30 ngày gần nhất" className="space-y-2">
      <p className="min-h-5 text-sm text-coffee-800" aria-hidden="true" data-testid="chart-tooltip">
        {shown ? dayLabel(shown) : "Rê chuột hoặc nhấn Tab để xem từng ngày."}
      </p>
      <div className="overflow-x-auto rounded-xl border border-coffee-100 bg-cream-50 p-3">
        <div className="min-w-[30rem]">
          <ul className="flex h-40 items-end gap-1" onMouseLeave={() => setActive(null)}>
            {days.map((d, i) => {
              const pct = d.revenue > 0 ? Math.max(4, Math.round((d.revenue / max) * 100)) : 0;
              return (
                <li
                  key={d.date}
                  tabIndex={0}
                  aria-label={dayLabel(d)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                  className="flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
                >
                  <div
                    className={cn(
                      "w-full rounded-t-sm",
                      d.revenue === 0
                        ? "bg-coffee-200"
                        : active === i
                          ? "bg-moss-800"
                          : "bg-moss-600",
                    )}
                    style={{ height: d.revenue > 0 ? `${pct}%` : "2px" }}
                  />
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex justify-between text-xs text-coffee-700" aria-hidden="true">
            <span>{days[0] ? shortDate(days[0].date) : ""}</span>
            <span>{days.length ? shortDate(days[Math.floor(days.length / 2)]!.date) : ""}</span>
            <span>{days.length ? shortDate(days[days.length - 1]!.date) : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
