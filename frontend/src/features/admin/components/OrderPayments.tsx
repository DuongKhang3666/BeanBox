"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AdminOrder, AdminPayment, AdminPaymentStatus } from "@/types/admin";
import { formatVnDateTime } from "../format";
import { PAYMENT_PROVIDER_LABEL, PAYMENT_RECORD_STATUS_LABEL } from "../labels";
import { RefundDialog } from "./RefundDialog";

const TONE: Record<AdminPaymentStatus, string> = {
  PENDING: "bg-cream-200 text-coffee-900",
  SUCCEEDED: "bg-moss-50 text-moss-800",
  FAILED: "bg-danger-50 text-danger-600",
  REFUNDED: "bg-coffee-100 text-coffee-800",
};

export function NeedsRefundBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-danger-600/40 bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-600",
        className,
      )}
    >
      Cần hoàn tiền
    </span>
  );
}

/** Banner đầu trang chi tiết đơn khi có Payment cần hoàn tiền. */
export function NeedsRefundBanner({ order }: { order: AdminOrder }) {
  if (!order.needsRefund) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger-600/40 bg-danger-50 px-4 py-3 text-danger-600"
    >
      <p className="font-semibold">Đơn này cần hoàn tiền</p>
      <p className="text-sm">
        {order.status === "CANCELLED"
          ? "Đơn đã hủy nhưng khách đã thanh toán."
          : "Khách đã thanh toán trùng cho đơn này."}{" "}
        Hãy hoàn tiền trên cổng thanh toán rồi ghi nhận tại khối Thanh toán bên dưới.
      </p>
    </div>
  );
}

function PaymentItem({
  payment,
  canRefund,
  onRefund,
}: {
  payment: AdminPayment;
  canRefund: boolean;
  onRefund: () => void;
}) {
  const provider = PAYMENT_PROVIDER_LABEL[payment.provider] ?? payment.provider;
  return (
    <li className="space-y-2 rounded-xl border border-coffee-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-coffee-900">
          {provider} · {formatVND(payment.amount)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {payment.needsRefund ? <NeedsRefundBadge /> : null}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
              TONE[payment.status],
            )}
          >
            {PAYMENT_RECORD_STATUS_LABEL[payment.status] ?? payment.status}
          </span>
        </div>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-coffee-700">Mã giao dịch</dt>
          <dd className="break-all font-mono text-coffee-900">{payment.providerTxnId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-coffee-700">Mã tham chiếu</dt>
          <dd className="break-all font-mono text-coffee-900">{payment.providerRef ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-coffee-700">Tạo lúc</dt>
          <dd className="text-coffee-900">{formatVnDateTime(payment.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-coffee-700">Cập nhật</dt>
          <dd className="text-coffee-900">{formatVnDateTime(payment.updatedAt)}</dd>
        </div>
        {payment.refundedAt ? (
          <div>
            <dt className="text-coffee-700">Hoàn tiền lúc</dt>
            <dd className="text-coffee-900">{formatVnDateTime(payment.refundedAt)}</dd>
          </div>
        ) : null}
        {payment.refundNote ? (
          <div className="sm:col-span-2">
            <dt className="text-coffee-700">Ghi chú hoàn tiền</dt>
            <dd className="break-words whitespace-pre-line text-coffee-900">
              {payment.refundNote}
            </dd>
          </div>
        ) : null}
      </dl>
      {canRefund && payment.status === "SUCCEEDED" ? (
        <Button variant="outline" size="sm" onClick={onRefund}>
          Ghi nhận đã hoàn tiền
        </Button>
      ) : null}
    </li>
  );
}

/** Khối "Thanh toán": liệt kê Payment; nút hoàn tiền chỉ cho ADMIN, chỉ với Payment SUCCEEDED. */
export function OrderPayments({
  order,
  onRefunded,
}: {
  order: AdminOrder;
  onRefunded: (order: AdminOrder) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [target, setTarget] = useState<AdminPayment | null>(null);
  const payments = order.payments ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-coffee-900">Thanh toán</h2>
        {order.needsRefund ? <NeedsRefundBadge /> : null}
      </div>
      {order.status === "PENDING_PAYMENT" && order.expiresAt ? (
        <p className="rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
          Hạn thanh toán: <strong>{formatVnDateTime(order.expiresAt)}</strong>. Sẽ tự hủy khi quá
          hạn.
        </p>
      ) : null}
      {payments.length === 0 ? (
        <p className="text-coffee-700">Chưa có giao dịch thanh toán online nào.</p>
      ) : (
        <ul aria-label="Giao dịch thanh toán" className="space-y-3">
          {payments.map((p) => (
            <PaymentItem key={p.id} payment={p} canRefund={isAdmin} onRefund={() => setTarget(p)} />
          ))}
        </ul>
      )}
      {target ? (
        <RefundDialog
          order={order}
          payment={target}
          onClose={() => setTarget(null)}
          onRefunded={(updated) => {
            setTarget(null);
            onRefunded(updated);
          }}
        />
      ) : null}
    </section>
  );
}
