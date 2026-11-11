"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { pageWindow } from "@/features/catalog/components/Pagination";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  paymentStatusLabel,
} from "@/features/orders/labels";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AdminOrderListItem, AdminOrderQuery, OrderStatusCounts } from "@/types/admin";
import type { OrderStatus, PaymentMethod } from "@/types/order";
import { ALL_ORDER_STATUSES, listAdminOrders } from "../api/orders";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import {
  ADMIN_PAGE_SIZE,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  orderFiltersHref,
  parseOrderFilters,
} from "../orderFilters";
import { NeedsRefundBadge } from "./OrderPayments";

const load = (key: string) => {
  const query = JSON.parse(key) as AdminOrderQuery;
  return listAdminOrders({ ...query, pageSize: ADMIN_PAGE_SIZE });
};

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const V2_STATUSES: OrderStatus[] = ["RETURN_REQUESTED", "RETURNED"];

/** Nhãn ngắn cho phương thức thanh toán trong bảng/thẻ. */
const METHOD_SHORT: Record<PaymentMethod, string> = {
  COD: "COD",
  VNPAY: "VNPay",
  STRIPE: "Stripe",
};

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

const th = "px-3 py-3 font-medium";

function OrdersTable({ orders }: { orders: AdminOrderListItem[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Danh sách đơn hàng</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Mã đơn
            </th>
            <th scope="col" className={th}>
              Ngày đặt
            </th>
            <th scope="col" className={th}>
              Khách hàng
            </th>
            <th scope="col" className={th}>
              SĐT
            </th>
            <th scope="col" className={th}>
              Tỉnh/thành
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Tổng tiền
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
            <th scope="col" className={th}>
              Thanh toán
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {orders.map((o) => (
            <tr key={o.code}>
              <td className="px-3 py-3">
                <Link
                  href={`/admin/don-hang/${encodeURIComponent(o.code)}`}
                  className="font-mono font-bold text-moss-800 underline"
                >
                  {o.code}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-3">{formatVnDateTime(o.createdAt)}</td>
              <td className="px-3 py-3">
                {o.customerName}
                {o.isGuest ? <span className="ml-1 text-xs text-coffee-700">(khách)</span> : null}
              </td>
              <td className="whitespace-nowrap px-3 py-3">{o.contactPhone}</td>
              <td className="px-3 py-3">{o.provinceName}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                {formatVND(o.grandTotal)}
              </td>
              <td className="px-3 py-3">
                <OrderStatusBadge status={o.status} />
                {o.needsRefund ? <NeedsRefundBadge className="mt-1" /> : null}
              </td>
              <td className="px-3 py-3">
                <span className="block">{METHOD_SHORT[o.paymentMethod] ?? o.paymentMethod}</span>
                <span className="block text-xs text-coffee-700">
                  {paymentStatusLabel(o.paymentStatus)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCards({ orders }: { orders: AdminOrderListItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {orders.map((o) => (
        <li key={o.code}>
          <Link
            href={`/admin/don-hang/${encodeURIComponent(o.code)}`}
            className="block space-y-2 rounded-2xl border border-coffee-200 bg-white p-4 hover:border-coffee-400 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono font-bold text-coffee-900">{o.code}</p>
                <p className="text-sm text-coffee-700">{formatVnDateTime(o.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <OrderStatusBadge status={o.status} />
                {o.needsRefund ? <NeedsRefundBadge /> : null}
              </div>
            </div>
            <p className="text-coffee-900">
              {o.customerName} · {o.contactPhone}
              {o.isGuest ? <span className="text-sm text-coffee-700"> (khách)</span> : null}
            </p>
            <p className="text-sm text-coffee-700">{o.provinceName}</p>
            <div className="flex items-center justify-between gap-3 border-t border-coffee-100 pt-2">
              <span className="text-sm text-coffee-700">
                {METHOD_SHORT[o.paymentMethod] ?? o.paymentMethod} ·{" "}
                {paymentStatusLabel(o.paymentStatus)}
              </span>
              <span className="font-bold text-coffee-900">{formatVND(o.grandTotal)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Pager({
  filters,
  page,
  totalPages,
}: {
  filters: AdminOrderQuery;
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
                href={orderFiltersHref({ ...filters, page: p })}
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

function StatusTabs({
  filters,
  counts,
}: {
  filters: AdminOrderQuery;
  counts: OrderStatusCounts | null;
}) {
  const total = counts ? ALL_ORDER_STATUSES.reduce((s, k) => s + counts[k], 0) : null;
  const tabs: Array<{ status: OrderStatus | undefined; label: string; count: number | null }> = [
    { status: undefined, label: "Tất cả", count: total },
    ...ALL_ORDER_STATUSES.filter((s) => !V2_STATUSES.includes(s) || (counts?.[s] ?? 0) > 0).map(
      (s) => ({ status: s, label: ORDER_STATUS_LABEL[s], count: counts ? counts[s] : null }),
    ),
  ];
  return (
    <nav aria-label="Lọc theo trạng thái">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {tabs.map((t) => {
          const active = t.status === filters.status;
          return (
            <li key={t.status ?? "all"} className="shrink-0">
              <Link
                href={orderFiltersHref({ ...filters, status: t.status, page: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                  active
                    ? "border-coffee-800 bg-coffee-800 text-cream-50"
                    : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                )}
              >
                {t.count !== null ? `${t.label} (${t.count})` : t.label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <Link
            href={orderFiltersHref({
              ...filters,
              needsRefund: filters.needsRefund ? undefined : true,
              page: undefined,
            })}
            aria-current={filters.needsRefund ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium",
              filters.needsRefund
                ? "border-danger-600 bg-danger-600 text-white"
                : "border-danger-600/50 bg-white text-danger-600 hover:bg-danger-50",
            )}
          >
            Cần hoàn tiền
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function AdminOrders() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseOrderFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = (new URLSearchParams(paramsKey).get("q") ?? "").trim();

  const [qInput, setQInput] = useState(urlQ);
  const [fromInput, setFromInput] = useState(filters.from ?? "");
  const [toInput, setToInput] = useState(filters.to ?? "");
  const [dateError, setDateError] = useState<string | null>(null);

  // Debounce ô tìm: chỉ cập nhật URL khi rỗng (xóa lọc) hoặc >= 2 ký tự.
  useEffect(() => {
    const t = qInput.trim();
    if (t === urlQ || t.length === 1) return;
    const id = setTimeout(() => {
      router.replace(orderFiltersHref({ ...filters, q: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, urlQ, filters, router]);

  const res = useResource(JSON.stringify(filters), load);

  function apply(patch: Partial<AdminOrderQuery>) {
    router.replace(orderFiltersHref({ ...filters, ...patch, page: undefined }));
  }

  function onDate(field: "from" | "to", value: string) {
    const from = field === "from" ? value : fromInput;
    const to = field === "to" ? value : toInput;
    if (field === "from") setFromInput(value);
    else setToInput(value);
    if (from && to && from > to) {
      setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setDateError(null);
    apply({ from: from || undefined, to: to || undefined });
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được danh sách đơn hàng"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có đơn hàng nào"
        description={
          filtered
            ? "Không có đơn nào khớp bộ lọc hiện tại."
            : "Khi có khách đặt hàng, đơn sẽ xuất hiện tại đây."
        }
        action={
          filtered ? (
            <Link href="/admin/don-hang" className={buttonClasses("outline")}>
              Xóa bộ lọc
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} đơn hàng</p>
        <OrdersTable orders={data} />
        <OrderCards orders={data} />
        <Pager filters={filters} page={meta.page} totalPages={meta.totalPages} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Đơn hàng</h1>
      <StatusTabs
        filters={filters}
        counts={res.status === "ready" ? res.data!.meta.statusCounts : null}
      />

      <form
        role="search"
        aria-label="Bộ lọc đơn hàng"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="adm-q">Tìm theo mã đơn, số điện thoại hoặc email</Label>
          <Input
            id="adm-q"
            type="search"
            value={qInput}
            maxLength={50}
            autoComplete="off"
            placeholder="Ít nhất 2 ký tự"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="adm-ps">Thanh toán</Label>
          <select
            id="adm-ps"
            className={selectClass}
            value={filters.paymentStatus ?? ""}
            onChange={(e) =>
              apply({
                paymentStatus: (e.target.value || undefined) as AdminOrderQuery["paymentStatus"],
              })
            }
          >
            <option value="">Tất cả</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="adm-pm">Phương thức thanh toán</Label>
          <select
            id="adm-pm"
            className={selectClass}
            value={filters.paymentMethod ?? ""}
            onChange={(e) =>
              apply({
                paymentMethod: (e.target.value || undefined) as AdminOrderQuery["paymentMethod"],
              })
            }
          >
            <option value="">Tất cả</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="adm-sort">Sắp xếp</Label>
          <select
            id="adm-sort"
            className={selectClass}
            value={filters.sort ?? "newest"}
            onChange={(e) => apply({ sort: e.target.value === "oldest" ? "oldest" : undefined })}
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
        <div>
          <Label htmlFor="adm-from">Từ ngày</Label>
          <Input
            id="adm-from"
            type="date"
            value={fromInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "adm-date-err" : undefined}
            onChange={(e) => onDate("from", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="adm-to">Đến ngày</Label>
          <Input
            id="adm-to"
            type="date"
            value={toInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "adm-date-err" : undefined}
            onChange={(e) => onDate("to", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <FieldError id="adm-date-err">{dateError}</FieldError>
        </div>
      </form>

      {body}
    </div>
  );
}
