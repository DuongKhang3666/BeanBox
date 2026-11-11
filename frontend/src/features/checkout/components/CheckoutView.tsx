"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCart } from "@/features/cart/CartProvider";
import { cartErrorMessage, hasBlockingIssue } from "@/features/cart/messages";
import { CheckoutForm } from "./CheckoutForm";

function CheckoutSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải trang thanh toán"
      role="status"
      className="space-y-4"
    >
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** Cổng vào /thanh-toan: giỏ đang tải / lỗi / rỗng / có dòng chặn, còn lại hiển thị form. */
export function CheckoutView() {
  const { status: authStatus, user } = useAuth();
  const { cart, status, error, reload } = useCart();
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <p role="status" className="py-10 text-center text-coffee-800">
        Đã tạo đơn hàng, đang chuyển tới bước tiếp theo...
      </p>
    );
  }

  // Giữ form khi đang tải lại giỏ nền (cart vẫn còn) để không mất dữ liệu người dùng đã nhập.
  if (authStatus === "loading" || !cart) {
    if (!cart && status === "error") {
      return (
        <ErrorState
          title="Không tải được giỏ hàng"
          description={error ? cartErrorMessage(error) : undefined}
          onRetry={reload}
        />
      );
    }
    return <CheckoutSkeleton />;
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Giỏ hàng của bạn đang trống"
        description="Hãy chọn vài món bạn thích trước khi thanh toán."
        action={
          <Link href="/gio-hang" className={buttonClasses("primary")}>
            Về giỏ hàng
          </Link>
        }
      />
    );
  }

  if (hasBlockingIssue(cart.items)) {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-danger-600/30 bg-danger-50 p-5 text-coffee-900"
      >
        <p>
          Giỏ hàng có sản phẩm đã hết hàng hoặc không đủ số lượng. Vui lòng điều chỉnh giỏ hàng
          trước khi thanh toán.
        </p>
        <Link href="/gio-hang" className={buttonClasses("secondary")}>
          Quay lại giỏ hàng
        </Link>
      </div>
    );
  }

  return <CheckoutForm cart={cart} user={user} onPlaced={() => setPlaced(true)} />;
}
