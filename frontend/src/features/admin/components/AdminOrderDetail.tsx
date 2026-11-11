"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { FormError } from "@/features/auth/components/FormError";
import { OrderItemsList } from "@/features/orders/components/OrderItemsList";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { OrderTotals } from "@/features/orders/components/OrderTotals";
import {
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  shippingMethodLabel,
} from "@/features/orders/labels";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminOrder, AdminOrderHistoryEntry } from "@/types/admin";
import { getAdminOrder } from "../api/orders";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { actionsFor, type StatusActionConfig } from "../orderActions";
import { NeedsRefundBadge, NeedsRefundBanner, OrderPayments } from "./OrderPayments";
import { StatusDialog } from "./StatusDialog";

const load = (code: string) => getAdminOrder(code);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <h2 className="font-serif text-lg font-bold text-coffee-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-coffee-700">{label}</dt>
      <dd className="break-words text-coffee-900">{children}</dd>
    </div>
  );
}

const ROLE_LABEL = { CUSTOMER: "Khách hàng", STAFF: "Nhân viên", ADMIN: "Quản trị viên" } as const;

function History({ history }: { history: AdminOrderHistoryEntry[] }) {
  const rows = [...history].reverse();
  return (
    <ol aria-label="Lịch sử đơn hàng" className="space-y-4 border-l-2 border-coffee-200 pl-4">
      {rows.map((h, i) => (
        <li key={`${h.createdAt}-${h.toStatus}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${
              i === 0 ? "bg-moss-700" : "bg-coffee-400"
            }`}
          />
          <p className={i === 0 ? "font-semibold text-coffee-900" : "text-coffee-800"}>
            {h.fromStatus ? `${orderStatusLabel(h.fromStatus)} → ` : ""}
            {orderStatusLabel(h.toStatus)}
          </p>
          <p className="text-sm text-coffee-700">
            {formatVnDateTime(h.createdAt)} ·{" "}
            {h.actor
              ? `${h.actor.fullName} (${ROLE_LABEL[h.actor.role] ?? h.actor.role})`
              : "Hệ thống"}
          </p>
          {h.note ? <p className="text-sm text-coffee-800">{h.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function AdminOrderDetail({ code }: { code: string }) {
  const res = useResource(code, load);
  const [action, setAction] = useState<StatusActionConfig | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const live = (
    <>
      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p className="rounded-lg border border-moss-600/40 bg-moss-50 px-3 py-2 text-sm text-moss-800">
            {notice}
          </p>
        ) : null}
      </div>
      <FormError>{alert}</FormError>
    </>
  );

  const body = (): React.ReactNode => {
    if (res.status === "loading" || res.status === "idle") {
      return (
        <div className="space-y-3">
          <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status" className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      );
    }
    if (res.status === "error") {
      if (res.error instanceof ApiError && res.error.status === 404) {
        return (
          <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
            <h1 className="font-serif text-xl font-bold text-coffee-900">
              Không tìm thấy đơn hàng
            </h1>
            <Link href="/admin/don-hang" className={buttonClasses("primary")}>
              Về danh sách đơn hàng
            </Link>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <ErrorState
            title="Không tải được đơn hàng"
            description={adminErrorMessage(res.error)}
            onRetry={res.retry}
          />
        </div>
      );
    }

    const order: AdminOrder = res.data!;
    const actions = actionsFor(order.status, order.allowedTransitions);
    const a = order.shippingAddress;

    return (
      <div className="space-y-4">
        <Link href="/admin/don-hang" className="text-sm font-medium text-moss-700 underline">
          ← Tất cả đơn hàng
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-coffee-900">Đơn hàng {order.code}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} />
            {order.needsRefund ? <NeedsRefundBadge /> : null}
            <Link
              href={`/admin/don-hang/${encodeURIComponent(order.code)}/in`}
              className={buttonClasses("outline", "sm")}
            >
              In phiếu giao
            </Link>
          </div>
        </div>

        <NeedsRefundBanner order={order} />

        <Card title="Cập nhật trạng thái">
          {actions.length === 0 ? (
            <p className="text-coffee-700">Không còn thao tác nào khả dụng cho đơn này.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((act) => (
                <Button
                  key={act.to}
                  variant={act.danger ? "danger" : "primary"}
                  onClick={() => {
                    setAlert(null);
                    setAction(act);
                  }}
                >
                  {act.label}
                </Button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Thông tin đơn hàng">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày đặt">{formatVnDateTime(order.createdAt)}</Field>
            <Field label="Thanh toán">
              {paymentMethodLabel(order.paymentMethod)} · {paymentStatusLabel(order.paymentStatus)}
            </Field>
            {order.paidAt ? (
              <Field label="Thanh toán lúc">{formatVnDateTime(order.paidAt)}</Field>
            ) : null}
            <Field label="Phương thức giao">{shippingMethodLabel(order.shippingMethod)}</Field>
            {order.deliveredAt ? (
              <Field label="Giao lúc">{formatVnDateTime(order.deliveredAt)}</Field>
            ) : null}
            {order.couponCode ? <Field label="Mã giảm giá">{order.couponCode}</Field> : null}
            {order.note ? (
              <div className="sm:col-span-2">
                <Field label="Ghi chú của khách">
                  <span className="whitespace-pre-line">{order.note}</span>
                </Field>
              </div>
            ) : null}
            {order.cancelReason ? (
              <div className="sm:col-span-2">
                <Field label="Lý do hủy">{order.cancelReason}</Field>
              </div>
            ) : null}
          </dl>
        </Card>

        <OrderPayments
          order={order}
          onRefunded={(updated) => {
            res.setData(updated);
            setAlert(null);
            setNotice("Đã ghi nhận hoàn tiền.");
          }}
        />

        <Card title="Khách hàng và giao nhận">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Loại khách">
              {order.isGuest || !order.customer ? (
                "Khách vãng lai (không có tài khoản)"
              ) : (
                <>
                  Tài khoản: {order.customer.fullName}
                  <span className="block text-sm text-coffee-700">{order.customer.email}</span>
                </>
              )}
            </Field>
            <Field label="Liên hệ">
              {order.contact.phone}
              <span className="block text-sm text-coffee-700">{order.contact.email}</span>
            </Field>
            <div className="sm:col-span-2">
              <dt className="text-sm text-coffee-700">Địa chỉ giao hàng</dt>
              <dd>
                <address className="not-italic text-coffee-900">
                  <p className="font-medium">
                    {a.fullName} · {a.phone}
                  </p>
                  <p>
                    {a.line1}, {a.wardName}, {a.provinceName}
                  </p>
                </address>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Sản phẩm">
          <OrderItemsList
            label="Sản phẩm trong đơn"
            items={order.items.map((i) => ({
              key: i.id,
              productName: i.productName,
              variantName: `${i.variantName} · SKU ${i.sku}`,
              imageUrl: i.imageUrl,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineTotal: i.lineTotal,
            }))}
          />
          <OrderTotals
            subtotal={order.subtotal}
            discountTotal={order.discountTotal}
            shippingFee={order.shippingFee}
            shippingDiscount={order.shippingDiscount}
            grandTotal={order.grandTotal}
          />
        </Card>

        <Card title="Vận đơn">
          {order.trackingNumber || order.carrier ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Mã vận đơn">{order.trackingNumber ?? "Chưa có"}</Field>
              <Field label="Đơn vị vận chuyển">{order.carrier ?? "Chưa có"}</Field>
            </dl>
          ) : (
            <p className="text-coffee-700">Chưa có thông tin vận đơn.</p>
          )}
        </Card>

        {order.history.length > 0 ? (
          <Card title="Lịch sử đơn hàng">
            <History history={order.history} />
          </Card>
        ) : null}

        {action ? (
          <StatusDialog
            order={order}
            action={action}
            onClose={() => setAction(null)}
            onUpdated={(updated) => {
              res.setData(updated);
              setAction(null);
              setAlert(null);
              setNotice(`Đã cập nhật trạng thái đơn thành "${orderStatusLabel(updated.status)}".`);
            }}
            onStale={(message) => {
              setAction(null);
              setNotice(null);
              setAlert(message);
              res.retry();
            }}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {live}
      {body()}
    </div>
  );
}
