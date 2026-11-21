"use client";

import Link from "next/link";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsOperations, HoursStat } from "@/types/admin";
import { getAnalyticsOperations } from "../api/analytics";
import {
  deltaPct,
  deltaPts,
  formatHours,
  formatInt,
  formatRate,
  rangeLabel,
} from "../analyticsRange";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { orderFiltersHref } from "../orderFilters";
import {
  BlockSkeleton,
  card,
  EmptyNote,
  h2,
  TableScroll,
  TD_NUM,
  TH,
  TH_NUM,
} from "./AnalyticsBreakdown";
import { ExportCsvButton } from "./ExportCsvButton";
import { Kpi } from "./AnalyticsKpi";

const linkClass =
  "font-medium text-moss-800 underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600";
const h3 = "font-serif text-base font-bold text-coffee-900";

/** key = `from|to|refresh`. */
function load(key: string): Promise<AnalyticsOperations> {
  const [from, to] = key.split("|") as [string, string];
  return getAnalyticsOperations({ from, to });
}

function CancelBreakdown({ d }: { d: AnalyticsOperations }) {
  const total = d.cancellations.total.current;
  if (total === 0 && d.cancellations.total.previous === 0) {
    return <EmptyNote>Không có đơn hủy nào trong khoảng thời gian này.</EmptyNote>;
  }
  const prevLabel = rangeLabel(d.previousRange);
  return (
    <TableScroll label="Bảng đơn hủy theo loại">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="px-3 py-2 text-left text-sm text-coffee-800">
          Đơn tạo trong kỳ đang ở trạng thái đã hủy, theo loại hủy ({formatInt(total)} đơn,{" "}
          {rangeLabel(d.range)})
        </caption>
        <thead className="bg-cream-100">
          <tr>
            <th scope="col" className={TH}>
              Loại hủy
            </th>
            <th scope="col" className={TH_NUM}>
              Số đơn
            </th>
            <th scope="col" className={cn(TH, "min-w-40")}>
              Tỷ lệ
            </th>
            <th scope="col" className={TH_NUM}>
              Kỳ trước ({prevLabel})
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {d.cancellations.byType.map((t) => {
            const share = total > 0 ? t.current / total : 0;
            return (
              <tr key={t.type}>
                <th scope="row" className="px-3 py-2 text-left font-medium break-words">
                  {t.label}
                </th>
                <td className={TD_NUM}>{formatInt(t.current)}</td>
                <td className="px-3 py-2">
                  <span className="tabular-nums">{formatRate(share)}</span>
                  <div
                    aria-hidden="true"
                    className="mt-1 h-2 w-full overflow-hidden rounded bg-cream-100"
                  >
                    <div
                      className="h-2 rounded bg-coffee-700"
                      style={{ width: `${Math.round(share * 1000) / 10}%` }}
                    />
                  </div>
                </td>
                <td className={TD_NUM}>{formatInt(t.previous)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-coffee-200 bg-cream-50 font-semibold">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">
              Tổng
            </th>
            <td className={TD_NUM}>{formatInt(total)}</td>
            <td className="px-3 py-2 tabular-nums">{total > 0 ? "100%" : "0%"}</td>
            <td className={TD_NUM}>{formatInt(d.cancellations.total.previous)}</td>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

function HoursCard({
  label,
  stat,
  note,
  prevLabel,
}: {
  label: string;
  stat: HoursStat;
  note: string;
  prevLabel: string;
}) {
  return (
    <section aria-label={label} className={card}>
      <p className="text-sm text-coffee-700">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">
        {formatHours(stat.avg)}
      </p>
      <p className="mt-1 text-sm text-coffee-800">
        {stat.n > 0
          ? `Trung vị ${formatHours(stat.median)} · ${formatInt(stat.n)} đơn`
          : "Chưa có đơn trong kỳ"}
      </p>
      <p className="mt-1 text-sm text-coffee-800">
        Kỳ trước ({prevLabel}): {formatHours(stat.previousAvg)}
      </p>
      <p className="mt-1 text-xs text-coffee-700">{note}</p>
    </section>
  );
}

function Attention({ d }: { d: AnalyticsOperations }) {
  const a = d.attention;
  const tiles: Array<{ key: string; label: string; count: number; href: string }> = [
    {
      key: "pending",
      label: "Đơn chờ xác nhận quá 24 giờ",
      count: a.pendingOver24h.count,
      href: orderFiltersHref({ status: "PENDING", sort: "oldest" }),
    },
    {
      key: "refund",
      label: "Đơn cần hoàn tiền",
      count: a.needsRefund,
      href: orderFiltersHref({ needsRefund: true }),
    },
    {
      key: "return",
      label: "Đơn khách yêu cầu trả hàng",
      count: a.returnRequested,
      href: orderFiltersHref({ status: "RETURN_REQUESTED" }),
    },
    {
      key: "failed",
      label: "Đơn giao hàng thất bại",
      count: a.failedDelivery,
      href: orderFiltersHref({ status: "FAILED_DELIVERY" }),
    },
  ];
  const all0 = tiles.every((t) => t.count === 0);
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key} className="rounded-xl border border-coffee-200 bg-cream-50 p-3">
            <p className="font-serif text-2xl font-bold text-coffee-900">{formatInt(t.count)}</p>
            <Link href={t.href} className={cn(linkClass, "text-sm")}>
              {t.label}
              <span className="sr-only">: xem danh sách đơn</span>
            </Link>
          </li>
        ))}
      </ul>
      {all0 ? <EmptyNote>Hiện không có đơn nào cần xử lý ngay.</EmptyNote> : null}
      {a.pendingOver24h.oldest.length > 0 ? (
        <TableScroll label="Bảng đơn chờ xác nhận lâu nhất">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <caption className="px-3 py-2 text-left text-sm text-coffee-800">
              Đơn chờ xác nhận lâu nhất ({a.pendingOver24h.oldest.length} trên{" "}
              {formatInt(a.pendingOver24h.count)} đơn)
            </caption>
            <thead className="bg-cream-100">
              <tr>
                <th scope="col" className={TH}>
                  Mã đơn
                </th>
                <th scope="col" className={TH}>
                  Tạo lúc
                </th>
                <th scope="col" className={TH_NUM}>
                  Giá trị
                </th>
                <th scope="col" className={TH_NUM}>
                  Đã chờ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-100">
              {a.pendingOver24h.oldest.map((o) => (
                <tr key={o.code}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link href={`/admin/don-hang/${o.code}`} className={linkClass}>
                      {o.code}
                    </Link>
                  </th>
                  <td className="px-3 py-2 whitespace-nowrap">{formatVnDateTime(o.createdAt)}</td>
                  <td className={TD_NUM}>{formatVND(o.grandTotal)}</td>
                  <td className={TD_NUM}>{formatHours(o.waitingHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
    </div>
  );
}

export function OperationsBlock({
  from,
  to,
  refresh,
}: {
  from: string;
  to: string;
  refresh: number;
}) {
  const res = useResource<AnalyticsOperations>(`${from}|${to}|${refresh}`, load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải số liệu vận hành" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được số liệu vận hành"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const prevLabel = rangeLabel(d.previousRange);
    const r = d.returns;
    body = (
      <div className="space-y-5">
        <section aria-labelledby="an-ops-cancel" className="space-y-2">
          <h3 id="an-ops-cancel" className={h3}>
            Đơn hủy theo loại
          </h3>
          <CancelBreakdown d={d} />
          <p className="text-xs text-coffee-700">
            Loại hủy lấy từ lịch sử trạng thái đơn và vai trò hiện tại của người hủy (đổi vai trò
            sau này làm số liệu cũ đổi theo). Tài khoản người hủy đã bị xóa được tính là khách hủy.
          </p>
        </section>

        <section aria-labelledby="an-ops-returns" className="space-y-2">
          <h3 id="an-ops-returns" className={h3}>
            Trả hàng và hoàn tiền
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Tỷ lệ trả hàng"
              value={formatRate(r.rate.current)}
              delta={deltaPts(r.rate)}
              upIsBad
              prevLabel={prevLabel}
              note={`${formatInt(r.returned.current)} / ${formatInt(r.delivered.current)} đơn đã giao`}
            />
            <Kpi
              label="Số lần hoàn tiền"
              value={formatInt(d.refunds.count.current)}
              delta={deltaPct(d.refunds.count)}
              upIsBad
              prevLabel={prevLabel}
            />
            <Kpi
              label="Số tiền hoàn"
              value={formatVND(d.refunds.amount.current)}
              delta={deltaPct(d.refunds.amount)}
              upIsBad
              prevLabel={prevLabel}
            />
          </div>
          <p className="text-xs text-coffee-700">
            Tỷ lệ trả hàng: đơn có ngày giao trong kỳ hiện đang ở trạng thái đã trả hàng, chia cho
            số đơn có ngày giao trong kỳ. Hoàn tiền tính theo ngày hoàn.
          </p>
        </section>

        <section aria-labelledby="an-ops-fulfil" className="space-y-2">
          <h3 id="an-ops-fulfil" className={h3}>
            Thời gian xử lý
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <HoursCard
              label="Từ lúc đặt đến lúc xác nhận"
              stat={d.fulfillment.confirmHours}
              note="Chỉ đơn thanh toán khi nhận hàng (đơn online tự xác nhận khi thanh toán), theo ngày xác nhận."
              prevLabel={prevLabel}
            />
            <HoursCard
              label="Từ lúc xác nhận đến lúc giao"
              stat={d.fulfillment.deliveryHours}
              note="Đơn có ngày giao trong kỳ."
              prevLabel={prevLabel}
            />
          </div>
          <p className="text-xs text-coffee-700">
            Số trung bình, kèm trung vị và số đơn làm mẫu; làm tròn tới 0,1 giờ.
          </p>
        </section>

        <section aria-labelledby="an-ops-attention" className="space-y-2">
          <h3 id="an-ops-attention" className={h3}>
            Cần xử lý ngay
          </h3>
          <p className="text-xs text-coffee-700">Số liệu hiện tại, không theo khoảng ngày.</p>
          <Attention d={d} />
        </section>
      </div>
    );
  }

  return (
    <section aria-labelledby="an-operations" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-operations" tabIndex={-1} className={h2}>
          Vận hành
        </h2>
        <ExportCsvButton params={{ report: "operations", from, to }} context="số liệu vận hành" />
      </div>
      {body}
    </section>
  );
}
