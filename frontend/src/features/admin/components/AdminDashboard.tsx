"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ORDER_STATUS_LABEL } from "@/features/orders/labels";
import { useResource } from "@/features/orders/useResource";
import { formatVND } from "@/lib/format";
import type { AdminDashboard as Dashboard } from "@/types/admin";
import { getAdminDashboard } from "../api/dashboard";
import { ALL_ORDER_STATUSES } from "../api/orders";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { inventoryHref } from "../inventoryFilters";
import { orderFiltersHref } from "../orderFilters";
import { PRODUCTS_BASE } from "../productFilters";
import { RevenueChart } from "./RevenueChart";

const load = () => getAdminDashboard();

const card = "rounded-2xl border border-coffee-200 bg-white p-4";
const h2 = "font-serif text-lg font-bold text-coffee-900";
const link = "font-medium text-moss-800 underline underline-offset-2";

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải tổng quan" role="status" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function StatCard({ label, revenue, orders }: { label: string; revenue: number; orders: number }) {
  return (
    <section aria-label={label} className={card}>
      <p className="text-sm text-coffee-700">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">
        {formatVND(revenue)}
      </p>
      <p className="text-sm text-coffee-800">{orders} đơn</p>
    </section>
  );
}

function Attention({ data }: { data: Dashboard }) {
  const { pendingOrders, needsRefund } = data.attention;
  return (
    <section aria-labelledby="dash-attn" className={card}>
      <h2 id="dash-attn" className={h2}>
        Cần chú ý
      </h2>
      {pendingOrders === 0 && needsRefund === 0 ? (
        <p className="mt-2 text-sm text-coffee-800">Không có mục nào cần xử lý.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {pendingOrders > 0 ? (
            <li>
              <Link href={orderFiltersHref({ status: "PENDING" })} className={link}>
                {pendingOrders} đơn chờ xác nhận
              </Link>
            </li>
          ) : null}
          {needsRefund > 0 ? (
            <li>
              <Link href={orderFiltersHref({ needsRefund: true })} className={link}>
                {needsRefund} đơn cần hoàn tiền
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function StatusCounts({ data }: { data: Dashboard }) {
  return (
    <section aria-labelledby="dash-status" className={card}>
      <h2 id="dash-status" className={h2}>
        Đơn theo trạng thái
      </h2>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {ALL_ORDER_STATUSES.map((s) => (
          <li key={s} className="flex items-center justify-between gap-2">
            <Link href={orderFiltersHref({ status: s })} className={link}>
              {ORDER_STATUS_LABEL[s] ?? s}
            </Link>
            <span className="text-coffee-900 tabular-nums">{data.ordersByStatus[s] ?? 0}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopProducts({ data }: { data: Dashboard }) {
  return (
    <section aria-labelledby="dash-top" className={card}>
      <h2 id="dash-top" className={h2}>
        Top 5 sản phẩm (30 ngày)
      </h2>
      {data.topProducts.length === 0 ? (
        <p className="mt-2 text-sm text-coffee-800">Chưa có đơn hàng trong 30 ngày qua.</p>
      ) : (
        <ol className="mt-2 space-y-2 text-sm">
          {data.topProducts.map((p) => (
            <li key={p.productId} className="flex items-start justify-between gap-3">
              <Link
                href={`${PRODUCTS_BASE}/${p.productId}`}
                className={`${link} min-w-0 break-words`}
              >
                {p.name}
              </Link>
              <span className="shrink-0 text-right text-coffee-800">
                {p.quantity} sp · {formatVND(p.revenue)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LowStock({ data }: { data: Dashboard }) {
  return (
    <section aria-labelledby="dash-low" className={card}>
      <h2 id="dash-low" className={h2}>
        Tồn kho thấp
      </h2>
      {data.lowStock.length === 0 ? (
        <p className="mt-2 text-sm text-coffee-800">Không có biến thể nào sắp hết hàng.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {data.lowStock.map((v) => (
            <li key={v.variantId} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={inventoryHref({ q: v.sku })} className={`${link} font-mono`}>
                  {v.sku}
                </Link>
                <p className="break-words text-coffee-800">
                  {v.productName} · {v.variantName}
                </p>
              </div>
              <span
                className={
                  v.stock <= 0
                    ? "shrink-0 font-bold text-danger-600"
                    : "shrink-0 font-bold text-coffee-900"
                }
              >
                {v.stock <= 0 ? "Hết hàng" : `Còn ${v.stock}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminDashboard() {
  const res = useResource<Dashboard>("dashboard", load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <DashboardSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được tổng quan"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    body = (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Hôm nay" revenue={d.revenue.today} orders={d.orders.today} />
          <StatCard label="7 ngày qua" revenue={d.revenue.last7Days} orders={d.orders.last7Days} />
          <StatCard
            label="30 ngày qua"
            revenue={d.revenue.last30Days}
            orders={d.orders.last30Days}
          />
        </div>
        <section aria-labelledby="dash-chart" className={card}>
          <h2 id="dash-chart" className={`${h2} mb-3`}>
            Doanh thu 30 ngày
          </h2>
          <RevenueChart days={d.dailyRevenue} />
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <Attention data={d} />
          <StatusCounts data={d} />
          <TopProducts data={d} />
          <LowStock data={d} />
        </div>
        <p className="text-xs text-coffee-700">
          Doanh thu tính theo ngày thanh toán; đơn đã hủy hoặc hoàn trả không tính. Số liệu quá khứ
          có thể thay đổi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Tổng quan</h1>
        <div className="flex flex-wrap items-center gap-3">
          {res.status === "ready" ? (
            <p className="text-sm text-coffee-700" aria-live="polite">
              Cập nhật lúc {formatVnDateTime(res.data!.generatedAt)}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={res.retry}
            loading={res.status === "loading"}
          >
            Làm mới
          </Button>
        </div>
      </div>
      {body}
    </div>
  );
}
