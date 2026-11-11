"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatVND } from "@/lib/format";
import { useCart } from "../CartProvider";
import { cartErrorMessage, couponReasonMessage } from "../messages";

export function CouponBox() {
  const { cart, applyCoupon, removeCoupon, pending } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const coupon = cart?.coupon ?? null;

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) {
      setError("Vui lòng nhập mã giảm giá.");
      return;
    }
    setError(null);
    try {
      await applyCoupon(value);
      setCode("");
    } catch (err) {
      setError(cartErrorMessage(err));
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await removeCoupon();
    } catch (err) {
      setError(cartErrorMessage(err));
    }
  }

  return (
    <section aria-label="Mã giảm giá" className="space-y-2">
      {coupon ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-coffee-300 bg-white p-3">
          <div className="min-w-0">
            <p className="text-sm text-coffee-700">Mã đã áp dụng</p>
            <p className="font-semibold text-coffee-900">{coupon.code}</p>
            {coupon.valid ? (
              coupon.discount > 0 ? (
                <p className="text-sm text-moss-700">Giảm {formatVND(coupon.discount)}</p>
              ) : null
            ) : (
              <p role="alert" className="text-sm text-danger-600">
                {couponReasonMessage(coupon.invalidReason, coupon.minOrder)}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} loading={pending.coupon}>
            Bỏ mã
          </Button>
        </div>
      ) : (
        <form onSubmit={onApply} noValidate className="space-y-2">
          <label htmlFor={inputId} className="block text-sm font-medium text-coffee-900">
            Mã giảm giá
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={50}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              className="h-11 min-w-0 flex-1 rounded-lg border border-coffee-400 bg-white px-3 text-base uppercase text-coffee-900 placeholder:normal-case"
              placeholder="Nhập mã"
            />
            <Button type="submit" variant="secondary" loading={pending.coupon}>
              Áp dụng
            </Button>
          </div>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
