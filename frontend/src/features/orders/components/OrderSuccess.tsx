"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { LAST_ORDER_KEY } from "@/features/checkout/components/CheckoutForm";
import { PayAgainButton } from "@/features/payments/components/PayAgainButton";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { Order } from "@/types/order";
import { getOrder, trackOrder } from "../api";
import { useResource } from "../useResource";
import { OrderDetail } from "./OrderDetail";
import { OrderStatusBadge } from "./OrderStatusBadge";

const subscribe = () => () => {};
function readLastOrder(): string | null {
  try {
    return sessionStorage.getItem(LAST_ORDER_KEY);
  } catch {
    return null;
  }
}

function parseOrder(raw: string | null, code: string): Order | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Order;
    return o && o.code === code ? o : null;
  } catch {
    return null;
  }
}

function CopyCode({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("done");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" size="sm" onClick={copy}>
        Sao chép mã
      </Button>
      <span role="status" className="text-sm text-coffee-700">
        {state === "done"
          ? "Đã sao chép"
          : state === "failed"
            ? "Không sao chép được, hãy chọn và sao chép thủ công"
            : ""}
      </span>
    </div>
  );
}

type Live = Pick<Order, "status" | "paymentStatus" | "canPay" | "expiresAt">;

/** Trạng thái hiện tại của đơn online (bản lưu trong sessionStorage có thể đã cũ). */
function useLiveState(stored: Order, authed: boolean, enabled: boolean) {
  const key = `${stored.code}|${authed}`;
  const [res, setRes] = useState<{ key: string; live: Live | null } | null>(null);
  const phone = stored.contact.phone;
  const code = stored.code;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = authed
      ? getOrder(code).then(
          (o): Live => ({
            status: o.status,
            paymentStatus: o.paymentStatus,
            canPay: o.canPay,
            expiresAt: o.expiresAt,
          }),
        )
      : trackOrder(code, phone).then(
          (o): Live => ({
            status: o.status,
            paymentStatus: o.paymentStatus,
            canPay: o.canPay,
            expiresAt: o.expiresAt ?? null,
          }),
        );
    load.then(
      (live) => !cancelled && setRes({ key, live }),
      () => !cancelled && setRes({ key, live: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, authed, code, phone, key]);

  const loaded = res !== null && res.key === key;
  return { live: loaded ? res.live : null, loading: enabled && !loaded };
}

function PaySection({
  order,
  phone,
  loading,
  notice,
}: {
  order: Pick<Order, "code" | "paymentMethod" | "status" | "canPay" | "expiresAt">;
  /** SĐT chuẩn hóa của khách chưa đăng nhập. */
  phone?: string;
  loading: boolean;
  notice: boolean;
}) {
  if (order.paymentMethod === "COD") return null;
  return (
    <div className="space-y-3 text-left">
      {notice ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-sm text-danger-600"
        >
          <p className="font-medium">Chưa mở được trang thanh toán</p>
          <p>Đơn hàng vẫn được giữ cho bạn trong thời gian chờ thanh toán. Hãy thử lại.</p>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-center text-sm text-coffee-700">
          Đang kiểm tra trạng thái thanh toán...
        </p>
      ) : order.canPay ? (
        <div className="flex justify-center">
          <PayAgainButton
            code={order.code}
            method={order.paymentMethod}
            expiresAt={order.expiresAt}
            phone={phone}
          />
        </div>
      ) : order.status === "PENDING_PAYMENT" ? (
        <p className="text-center text-sm text-coffee-800">
          Đơn hàng đã quá hạn thanh toán và sẽ bị hủy.
        </p>
      ) : null}
    </div>
  );
}

function titleFor(status: Order["status"]): string {
  if (status === "PENDING_PAYMENT") return "Đơn hàng đang chờ thanh toán";
  if (status === "CANCELLED") return "Đơn hàng đã bị hủy";
  return "Đặt hàng thành công";
}

function Header({
  order,
  authed,
  pay,
}: {
  order: Order;
  authed: boolean;
  pay?: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="success-title"
      className="space-y-3 rounded-2xl border border-moss-200 bg-moss-50 p-5 text-center sm:p-8"
    >
      <h1 id="success-title" className="font-serif text-2xl font-bold text-moss-800 sm:text-3xl">
        {titleFor(order.status)}
      </h1>
      <p className="text-coffee-800">Mã đơn hàng của bạn</p>
      <p
        data-testid="order-code"
        className="font-mono text-3xl font-bold tracking-wider text-coffee-900"
      >
        {order.code}
      </p>
      <CopyCode code={order.code} />
      <div className="flex justify-center">
        <OrderStatusBadge status={order.status} />
      </div>
      {order.paymentMethod === "COD" ? (
        <p className="font-medium text-coffee-900">
          Vui lòng chuẩn bị {formatVND(order.grandTotal)} khi nhận hàng.
        </p>
      ) : null}
      <p className="text-sm text-coffee-700">
        Email xác nhận đã được gửi tới {order.contact.email}.
      </p>
      {pay}
      <Actions code={order.code} authed={authed} />
    </section>
  );
}

function Actions({ code, authed }: { code: string; authed: boolean }) {
  return (
    <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
      {authed ? (
        <Link
          href={`/tai-khoan/don-hang/${encodeURIComponent(code)}`}
          className={buttonClasses("primary")}
        >
          Xem chi tiết đơn
        </Link>
      ) : (
        <Link
          href={`/tra-cuu-don-hang?code=${encodeURIComponent(code)}`}
          className={buttonClasses("primary")}
        >
          Tra cứu đơn hàng
        </Link>
      )}
      <Link href="/" className={buttonClasses("outline")}>
        Tiếp tục mua sắm
      </Link>
    </div>
  );
}

const loadOrder = (code: string) => getOrder(code);

function Fetched({ code, paymentNotice }: { code: string; paymentNotice: boolean }) {
  const res = useResource(code, loadOrder);
  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status" className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    const notFound = res.error instanceof ApiError && res.error.status === 404;
    return notFound ? (
      <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
        <h1 className="font-serif text-xl font-bold text-coffee-900">Không tìm thấy đơn hàng</h1>
        <Link href="/tai-khoan/don-hang" className={buttonClasses("primary")}>
          Xem danh sách đơn hàng
        </Link>
      </div>
    ) : (
      <ErrorState title="Không tải được đơn hàng" onRetry={res.retry} />
    );
  }
  const order = res.data!;
  return (
    <div className="space-y-6">
      <Header
        order={order}
        authed
        pay={<PaySection order={order} loading={false} notice={paymentNotice} />}
      />
      <OrderDetail order={order} />
    </div>
  );
}

function Stored({
  stored,
  authed,
  authReady,
  paymentNotice,
}: {
  stored: Order;
  authed: boolean;
  /** Đã biết đăng nhập hay chưa (quyết định gọi GET /orders/:code hay /orders/track). */
  authReady: boolean;
  paymentNotice: boolean;
}) {
  const online = stored.paymentMethod !== "COD";
  const { live, loading } = useLiveState(stored, authed, online && authReady);
  const order: Order = live ? { ...stored, ...live } : stored;
  return (
    <div className="space-y-6">
      <Header
        order={order}
        authed={authed}
        pay={
          <PaySection
            order={order}
            phone={authed ? undefined : stored.contact.phone}
            loading={loading}
            notice={paymentNotice}
          />
        }
      />
      <OrderDetail order={order} />
    </div>
  );
}

export function OrderSuccess({
  code,
  paymentNotice = false,
}: {
  code: string;
  /** Tạo phiên thanh toán thất bại ngay sau khi đặt đơn (?pay=failed). */
  paymentNotice?: boolean;
}) {
  const { status: authStatus } = useAuth();
  const raw = useSyncExternalStore(subscribe, readLastOrder, () => null);
  const stored = useMemo(() => parseOrder(raw, code), [raw, code]);
  const authed = authStatus === "authenticated";

  if (stored) {
    return (
      <Stored
        stored={stored}
        authed={authed}
        authReady={authStatus !== "loading"}
        paymentNotice={paymentNotice}
      />
    );
  }
  if (authStatus === "loading") {
    return (
      <div aria-busy="true" aria-label="Đang tải đơn hàng" role="status">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (authed) return <Fetched code={code} paymentNotice={paymentNotice} />;

  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Không thể hiển thị lại chi tiết đơn trên thiết bị này
      </h1>
      <p className="text-coffee-800">
        Nếu bạn vừa đặt đơn {code}, hãy dùng mã đơn và số điện thoại đặt hàng để tra cứu.
      </p>
      <Actions code={code} authed={false} />
    </section>
  );
}
