"use client";

import { ErrorState } from "@/components/ui/ErrorState";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsCustomers } from "@/types/admin";
import { getAnalyticsCustomers } from "../api/analytics";
import { deltaPct, deltaPts, formatInt, formatRate, rangeLabel } from "../analyticsRange";
import { adminErrorMessage } from "../errors";
import { BlockSkeleton, card, EmptyNote, h2 } from "./AnalyticsBreakdown";
import { ExportCsvButton } from "./ExportCsvButton";
import { Kpi } from "./AnalyticsKpi";

/** key = `from|to|refresh`. */
function load(key: string): Promise<AnalyticsCustomers> {
  const [from, to] = key.split("|") as [string, string];
  return getAnalyticsCustomers({ from, to });
}

export function CustomersBlock({
  from,
  to,
  refresh,
}: {
  from: string;
  to: string;
  refresh: number;
}) {
  const res = useResource<AnalyticsCustomers>(`${from}|${to}|${refresh}`, load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải số liệu khách hàng" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được số liệu khách hàng"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const prevLabel = rangeLabel(d.previousRange);
    if (d.buyers.current === 0 && d.buyers.previous === 0) {
      body = <EmptyNote>Chưa có khách nào mua hàng trong khoảng thời gian này.</EmptyNote>;
    } else {
      body = (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Khách mua hàng"
              value={formatInt(d.buyers.current)}
              delta={deltaPct(d.buyers)}
              prevLabel={prevLabel}
            />
            <Kpi
              label="Khách mua lần đầu"
              value={formatInt(d.firstTime.current)}
              delta={deltaPct(d.firstTime)}
              prevLabel={prevLabel}
            />
            <Kpi
              label="Khách quay lại"
              value={formatInt(d.returning.current)}
              delta={deltaPct(d.returning)}
              prevLabel={prevLabel}
            />
            <Kpi
              label="Tỷ lệ mua lại"
              value={formatRate(d.repeatRate.current)}
              delta={deltaPts(d.repeatRate)}
              prevLabel={prevLabel}
              note="Khách có từ 2 đơn trở lên trong kỳ"
            />
            <Kpi
              label="Doanh thu khách mới"
              value={formatVND(d.firstTimeRevenue.current)}
              delta={deltaPct(d.firstTimeRevenue)}
              prevLabel={prevLabel}
            />
            <Kpi
              label="Doanh thu khách quay lại"
              value={formatVND(d.returningRevenue.current)}
              delta={deltaPct(d.returningRevenue)}
              prevLabel={prevLabel}
            />
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-coffee-700">
            <li>
              Khách mua lần đầu: đơn đã thanh toán sớm nhất (mọi thời điểm) của khách nằm trong kỳ.
              Khách quay lại: đã có đơn đã thanh toán trước kỳ. Đơn bị hủy hoặc hoàn trả không được
              tính.
            </li>
            <li>
              Khách có tài khoản gộp theo tài khoản; khách vãng lai gộp theo email (không phân biệt
              hoa thường). Doanh thu khách mới cộng doanh thu khách quay lại bằng tổng doanh thu ở
              mục tổng quan.
            </li>
          </ul>
        </div>
      );
    }
  }

  return (
    <section aria-labelledby="an-customers" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-customers" tabIndex={-1} className={h2}>
          Khách hàng
        </h2>
        <ExportCsvButton params={{ report: "customers", from, to }} context="số liệu khách hàng" />
      </div>
      {body}
    </section>
  );
}
