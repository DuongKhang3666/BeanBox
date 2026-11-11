"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { orderErrorMessage } from "@/features/orders/labels";
import { cn } from "@/lib/cn";
import type { PaymentMethod } from "@/types/order";
import { createStripeSession, createVnpayPayment } from "../api";
import { goToPayment } from "../redirect";
import { WARN_BEFORE_MS, formatCountdown, useRemainingMs } from "../useCountdown";

export interface PayAgainButtonProps {
  code: string;
  /** Phương thức của đơn; COD thì không hiển thị gì. */
  method: PaymentMethod;
  /** Hạn thanh toán của đơn; không có thì không đếm ngược. */
  expiresAt?: string | null;
  /** SĐT khách (đã chuẩn hóa) cho luồng không đăng nhập; không truyền khi chủ đơn đã đăng nhập. */
  phone?: string;
  /** Trả false để chặn lần bấm này (vd. SĐT chưa hợp lệ). */
  onBeforePay?: () => boolean;
  label?: string;
  className?: string;
}

/** "Thanh toán lại" (D-001): đếm ngược tới hạn đơn, tự ẩn khi hết hạn. */
export function PayAgainButton({
  code,
  method,
  expiresAt,
  phone,
  onBeforePay,
  label = "Thanh toán lại",
  className,
}: PayAgainButtonProps) {
  const remaining = useRemainingMs(expiresAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  if (method === "COD") return null;

  if (remaining === 0) {
    return (
      <p role="status" className={cn("text-sm text-coffee-800", className)}>
        Đơn hàng đã quá hạn thanh toán và sẽ bị hủy.
      </p>
    );
  }

  const warn = remaining !== null && remaining <= WARN_BEFORE_MS;

  async function onClick() {
    if (lock.current) return;
    if (onBeforePay && !onBeforePay()) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const input = { code, ...(phone ? { phone } : {}) };
      const session =
        method === "VNPAY" ? await createVnpayPayment(input) : await createStripeSession(input);
      if (goToPayment(session.redirectUrl)) return; // đang rời trang: giữ trạng thái loading
      setError("Không mở được trang thanh toán. Vui lòng thử lại.");
    } catch (err) {
      setError(orderErrorMessage(err));
    }
    lock.current = false;
    setBusy(false);
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="pay-again">
      {remaining !== null ? (
        <p className="text-sm text-coffee-800">
          Còn {/* role=timer: không tự đọc mỗi giây */}
          <span role="timer" className="font-mono font-semibold text-coffee-900">
            {formatCountdown(remaining)}
          </span>{" "}
          để thanh toán
        </p>
      ) : null}
      <Button onClick={onClick} loading={busy} className="w-full sm:w-auto">
        {busy ? "Đang mở trang thanh toán..." : label}
      </Button>
      <p role="status" className="sr-only">
        {warn ? "Đơn hàng sắp hết hạn thanh toán, còn dưới 1 phút." : ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
