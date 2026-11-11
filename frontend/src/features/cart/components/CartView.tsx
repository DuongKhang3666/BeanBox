"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { useCart } from "../CartProvider";
import { cartErrorMessage } from "../messages";
import { CartLine } from "./CartLine";
import { CartSummary } from "./CartSummary";

function CartSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải giỏ hàng" role="status" className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

export function CartView() {
  const { cart, status, error, notice, pending, reload, dismissNotice, clearCart } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  async function onClear() {
    setClearError(null);
    try {
      await clearCart();
      setConfirmClear(false);
    } catch (e) {
      setConfirmClear(false);
      setClearError(cartErrorMessage(e));
    }
  }

  let body: React.ReactNode;
  if (status === "idle" || status === "loading") {
    body = <CartSkeleton />;
  } else if (status === "error" || !cart) {
    body = (
      <ErrorState
        title="Không tải được giỏ hàng"
        description={error ? cartErrorMessage(error) : undefined}
        onRetry={reload}
      />
    );
  } else if (cart.items.length === 0) {
    body = (
      <EmptyState
        title="Giỏ hàng của bạn đang trống"
        description="Hãy chọn vài món cà phê hoặc dụng cụ pha chế bạn thích."
        action={
          <Link href="/" className={buttonClasses("primary")}>
            Tiếp tục mua sắm
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section aria-label="Sản phẩm trong giỏ">
          <ul className="divide-y divide-coffee-200 border-y border-coffee-200">
            {cart.items.map((item) => (
              <CartLine key={item.id} item={item} />
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Link href="/" className="text-sm font-medium text-moss-700 underline">
              Tiếp tục mua sắm
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              Xóa toàn bộ giỏ
            </Button>
          </div>
          {clearError ? (
            <p role="alert" className="mt-2 text-sm text-danger-600">
              {clearError}
            </p>
          ) : null}
        </section>
        <CartSummary cart={cart} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Đóng thông báo"
            className="h-8 w-8 shrink-0 rounded text-lg hover:bg-amber-100"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      {status === "ready" && error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger-600/30 bg-danger-50 px-4 py-3 text-coffee-900"
        >
          <p>{cartErrorMessage(error)}</p>
          <Button size="sm" variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {body}
      {confirmClear ? (
        <ConfirmDialog
          title="Xóa toàn bộ giỏ hàng?"
          description="Tất cả sản phẩm và mã giảm giá trong giỏ sẽ bị xóa."
          confirmLabel="Xóa toàn bộ"
          busy={pending.clearing}
          onConfirm={onClear}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
    </div>
  );
}
