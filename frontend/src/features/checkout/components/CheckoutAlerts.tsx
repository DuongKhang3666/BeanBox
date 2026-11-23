"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";
import { couponReasonMessage } from "@/features/cart/messages";
import type { Quote } from "@/types/order";
import type { Problem } from "../hooks/useCheckoutSubmit";

/** Khung thông báo lỗi đặt hàng (đầu form), có nút "Bỏ mã" / link về giỏ hàng theo `problem.action`. */
export function ProblemAlert({
  problem,
  alertRef,
  onRemoveCoupon,
  couponBusy,
}: {
  problem: Problem;
  alertRef: React.RefObject<HTMLDivElement | null>;
  onRemoveCoupon: () => void;
  couponBusy: boolean;
}) {
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-sm text-danger-600"
    >
      <p>{problem.message}</p>
      {problem.action === "removeCoupon" ? (
        <Button variant="outline" size="sm" onClick={onRemoveCoupon} loading={couponBusy}>
          Bỏ mã
        </Button>
      ) : null}
      {problem.action === "cart" ? (
        <Link href="/gio-hang" className="font-medium underline">
          Quay lại giỏ hàng
        </Link>
      ) : null}
    </div>
  );
}

/** Cảnh báo giỏ có sản phẩm hết hàng / không đủ số lượng. */
export function IssuesNotice() {
  return (
    <FormError>
      Một số sản phẩm trong giỏ đã hết hàng hoặc không đủ số lượng. Vui lòng{" "}
      <Link href="/gio-hang" className="font-medium underline">
        quay lại giỏ hàng
      </Link>{" "}
      để điều chỉnh trước khi đặt hàng.
    </FormError>
  );
}

/** Mã giảm giá không còn hợp lệ ở lần tính phí mới nhất. */
export function InvalidCouponNotice({
  coupon,
  onRemoveCoupon,
  couponBusy,
}: {
  coupon: NonNullable<Quote["coupon"]>;
  onRemoveCoupon: () => void;
  couponBusy: boolean;
}) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-sm text-danger-600"
    >
      <p>
        Mã giảm giá {coupon.code} không còn hợp lệ.{" "}
        {couponReasonMessage(coupon.invalidReason, coupon.minOrder)} Vui lòng bỏ mã để tiếp tục đặt
        hàng.
      </p>
      <Button variant="outline" size="sm" onClick={onRemoveCoupon} loading={couponBusy}>
        Bỏ mã
      </Button>
    </div>
  );
}
