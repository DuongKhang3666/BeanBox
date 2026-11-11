"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { shippingMethodLabel } from "@/features/orders/labels";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { AdminOrder } from "@/types/admin";
import { getAdminOrder } from "../api/orders";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";

const load = (code: string) => getAdminOrder(code);

/** Tiền thu hộ: đơn chưa thanh toán thu đủ `grandTotal`, đã thanh toán (PAID) thì 0. */
export function collectOnDelivery(order: Pick<AdminOrder, "paymentStatus" | "grandTotal">): number {
  return order.paymentStatus === "PAID" ? 0 : order.grandTotal;
}

export function AdminOrderPrint({ code }: { code: string }) {
  const res = useResource(code, load);

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải phiếu giao" role="status" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 404) {
      return (
        <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
          <h1 className="font-serif text-xl font-bold text-coffee-900">Không tìm thấy đơn hàng</h1>
          <Link href="/admin/don-hang" className={buttonClasses("primary")}>
            Về danh sách đơn hàng
          </Link>
        </div>
      );
    }
    return (
      <ErrorState
        title="Không tải được phiếu giao"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }

  const order = res.data!;
  const a = order.shippingAddress;
  const cod = collectOnDelivery(order);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/admin/don-hang/${encodeURIComponent(order.code)}`}
          className="text-sm font-medium text-moss-700 underline"
        >
          ← Quay lại đơn hàng
        </Link>
        <Button onClick={() => window.print()}>In</Button>
      </div>

      <article
        aria-label={`Phiếu giao hàng ${order.code}`}
        className="space-y-4 rounded-2xl border border-coffee-300 bg-white p-5 text-coffee-900 print:rounded-none print:border-0 print:p-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-coffee-300 pb-3">
          <div>
            <p className="font-serif text-xl font-bold">BeanBox</p>
            <h1 className="text-lg font-bold">Phiếu giao hàng</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">{order.code}</p>
            <p className="text-sm">Ngày đặt: {formatVnDateTime(order.createdAt)}</p>
          </div>
        </header>

        <section aria-label="Người nhận">
          <h2 className="text-sm font-bold uppercase">Người nhận</h2>
          <p className="font-medium">
            {a.fullName} · {a.phone}
          </p>
          <p>
            {a.line1}, {a.wardName}, {a.provinceName}
          </p>
        </section>

        <section aria-label="Hàng hóa">
          <h2 className="text-sm font-bold uppercase">Hàng hóa</h2>
          <table className="mt-1 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-coffee-400">
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Sản phẩm
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  SKU
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  SL
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-coffee-200 align-top">
                  <td className="py-1.5 pr-2">
                    {i.productName}
                    <span className="block text-coffee-700">{i.variantName}</span>
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{i.sku}</td>
                  <td className="py-1.5 text-right font-semibold">{i.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-coffee-700">Phương thức giao</dt>
            <dd>{shippingMethodLabel(order.shippingMethod)}</dd>
          </div>
          <div>
            <dt className="text-coffee-700">Mã vận đơn</dt>
            <dd>
              {order.trackingNumber
                ? `${order.trackingNumber}${order.carrier ? ` (${order.carrier})` : ""}`
                : "Chưa có"}
            </dd>
          </div>
          {order.note ? (
            <div className="sm:col-span-2">
              <dt className="text-coffee-700">Ghi chú</dt>
              <dd className="whitespace-pre-line">{order.note}</dd>
            </div>
          ) : null}
        </dl>

        <p className="flex items-center justify-between gap-3 rounded-lg border-2 border-coffee-900 px-4 py-3 text-lg font-bold">
          <span>Tiền thu hộ (COD)</span>
          <span data-testid="cod-amount">{formatVND(cod)}</span>
        </p>
      </article>
    </div>
  );
}
