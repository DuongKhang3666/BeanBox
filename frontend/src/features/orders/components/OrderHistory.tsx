"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { pageWindow } from "@/features/catalog/components/Pagination";
import { cn } from "@/lib/cn";
import { formatDateTime, formatVND } from "@/lib/format";
import type { OrderListItem } from "@/types/order";
import { listMyOrders } from "../api";
import { orderErrorMessage, paymentMethodLabel } from "../labels";
import { useResource } from "../useResource";
import { OrderStatusBadge } from "./OrderStatusBadge";

export const PAGE_SIZE = 10;
const BASE = "/tai-khoan/don-hang";

export const ORDER_TABS = [
  { id: "all", label: "Tất cả", status: "" },
  { id: "pending", label: "Chờ xử lý", status: "PENDING_PAYMENT,PENDING" },
  { id: "processing", label: "Đang xử lý", status: "CONFIRMED,PROCESSING" },
  { id: "shipping", label: "Đang giao", status: "SHIPPING,FAILED_DELIVERY" },
  { id: "delivered", label: "Đã giao", status: "DELIVERED" },
  { id: "cancelled", label: "Đã hủy", status: "CANCELLED" },
] as const;

export function ordersHref(status: string, page: number): string {
  const qs: string[] = [];
  if (status) qs.push(`status=${status}`);
  if (page > 1) qs.push(`page=${page}`);
  return qs.length ? `${BASE}?${qs.join("&")}` : BASE;
}

function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}

const load = (key: string) => {
  const { status, page } = JSON.parse(key) as { status: string; page: number };
  return listMyOrders({ status: status || undefined, page, pageSize: PAGE_SIZE });
};

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 w-full" />
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: OrderListItem }) {
  const shownQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const extra = order.itemCount - shownQty;
  return (
    <li>
      <Link
        href={`${BASE}/${encodeURIComponent(order.code)}`}
        className="block space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 hover:border-coffee-400 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono font-bold text-coffee-900">{order.code}</p>
            <p className="text-sm text-coffee-700">{formatDateTime(order.createdAt)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <ul className="space-y-2">
          {order.items.slice(0, 3).map((it, i) => (
            <li
              key={`${i}-${it.productName}-${it.variantName}`}
              className="flex items-center gap-3"
            >
              <ProductImage
                src={it.imageUrl}
                name={it.productName}
                sizes="48px"
                className="h-12 w-12 shrink-0 rounded-md"
              />
              <p className="min-w-0 flex-1 truncate text-coffee-900">
                {it.productName}
                <span className="text-coffee-700"> · {it.variantName}</span>
              </p>
              <span className="shrink-0 text-sm text-coffee-700">x{it.quantity}</span>
            </li>
          ))}
        </ul>
        {extra > 0 ? <p className="text-sm text-coffee-700">+{extra} sản phẩm</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-coffee-100 pt-3">
          <span className="text-sm text-coffee-700">{paymentMethodLabel(order.paymentMethod)}</span>
          <span className="font-bold text-coffee-900">{formatVND(order.grandTotal)}</span>
        </div>
      </Link>
    </li>
  );
}

function OrdersPagination({
  status,
  page,
  totalPages,
}: {
  status: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const item =
    "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-medium";
  return (
    <nav aria-label="Phân trang" className="mt-6">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-coffee-600">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={ordersHref(status, p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Trang ${p}`}
                className={cn(
                  item,
                  p === page
                    ? "border-moss-700 bg-moss-700 text-white"
                    : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

export function OrderHistory() {
  const params = useSearchParams();
  const rawStatus = params.get("status") ?? "";
  const tab = ORDER_TABS.find((t) => t.status === rawStatus) ?? ORDER_TABS[0];
  const page = parsePage(params.get("page"));
  const res = useResource(JSON.stringify({ status: tab.status, page }), load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được danh sách đơn hàng"
        description={orderErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body =
      tab.id === "all" ? (
        <EmptyState
          title="Bạn chưa có đơn hàng nào"
          description="Khi bạn đặt hàng, đơn sẽ xuất hiện tại đây."
          action={
            <Link href="/" className={buttonClasses("primary")}>
              Bắt đầu mua sắm
            </Link>
          }
        />
      ) : (
        <EmptyState title="Không có đơn hàng nào trong mục này" />
      );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <ul className="space-y-3">
          {data.map((o) => (
            <OrderCard key={o.code} order={o} />
          ))}
        </ul>
        <OrdersPagination status={tab.status} page={meta.page} totalPages={meta.totalPages} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Đơn hàng của tôi</h1>
      <nav aria-label="Lọc đơn hàng">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {ORDER_TABS.map((t) => (
            <li key={t.id} className="shrink-0">
              <Link
                href={ordersHref(t.status, 1)}
                aria-current={t.id === tab.id ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium",
                  t.id === tab.id
                    ? "border-coffee-800 bg-coffee-800 text-cream-50"
                    : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
