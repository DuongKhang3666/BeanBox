"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { FormNotice } from "@/features/auth/components/FormError";
import { PayAgainButton } from "@/features/payments/components/PayAgainButton";
import { ApiError } from "@/lib/api/errors";
import { cancelOrder, getOrder } from "../api";
import { orderErrorMessage } from "../labels";
import { useResource } from "../useResource";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { OrderDetail } from "./OrderDetail";
import { OrderStatusBadge } from "./OrderStatusBadge";

const load = (code: string) => getOrder(code);

export function AccountOrderDetail({ code }: { code: string }) {
  const res = useResource(code, load);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | undefined>();

  async function onCancel(reason: string) {
    if (busy) return;
    setBusy(true);
    setCancelError(null);
    try {
      const updated = await cancelOrder(code, reason ? { reason } : {});
      res.setData(updated);
      setNotice("Đã hủy đơn hàng thành công.");
      setOpen(false);
    } catch (err) {
      setCancelError(orderErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status" className="space-y-3">
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
          <Link href="/tai-khoan/don-hang" className={buttonClasses("primary")}>
            Xem danh sách đơn hàng
          </Link>
        </div>
      );
    }
    return (
      <ErrorState
        title="Không tải được đơn hàng"
        description={orderErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }

  const order = res.data!;
  return (
    <div className="space-y-4">
      <Link href="/tai-khoan/don-hang" className="text-sm font-medium text-moss-700 underline">
        ← Tất cả đơn hàng
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-coffee-900">Đơn hàng {order.code}</h1>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {order.canCancel ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setCancelError(null);
                setOpen(true);
              }}
            >
              Hủy đơn
            </Button>
          ) : null}
        </div>
      </div>
      <FormNotice>{notice}</FormNotice>
      {order.canPay ? (
        <section
          aria-label="Thanh toán đơn hàng"
          className="rounded-2xl border border-moss-200 bg-moss-50 p-4 sm:p-5"
        >
          <p className="mb-2 font-medium text-coffee-900">Đơn hàng đang chờ thanh toán.</p>
          <PayAgainButton
            code={order.code}
            method={order.paymentMethod}
            expiresAt={order.expiresAt}
          />
        </section>
      ) : null}
      <OrderDetail order={order} />
      {open ? (
        <CancelOrderDialog
          code={order.code}
          busy={busy}
          error={cancelError}
          onConfirm={onCancel}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
