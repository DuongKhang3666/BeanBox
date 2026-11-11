"use client";

import { useState } from "react";
import { CouponBox } from "@/features/cart/components/CouponBox";
import { OrderItemsList, type OrderLine } from "@/features/orders/components/OrderItemsList";
import { OrderTotals, type OrderTotalsProps } from "@/features/orders/components/OrderTotals";
import { formatVND } from "@/lib/format";

/** Tóm tắt đơn: desktop luôn mở + sticky, mobile thu gọn được. */
export function CheckoutSummary({
  lines,
  totals,
  note,
}: {
  lines: OrderLine[];
  totals: OrderTotalsProps;
  /** Dòng giải thích dưới tổng (vd. đang tính phí). */
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const total = totals.grandTotal ?? totals.subtotal - totals.discountTotal;

  return (
    <aside
      aria-label="Tóm tắt đơn hàng"
      className="rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5 lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-coffee-900">Tóm tắt đơn hàng</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="checkout-summary-body"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-moss-700 underline lg:hidden"
        >
          {open ? "Thu gọn" : `Xem (${formatVND(total)})`}
        </button>
      </div>
      <div
        id="checkout-summary-body"
        className={open ? "mt-3 space-y-4" : "mt-3 hidden space-y-4 lg:block"}
      >
        <OrderItemsList items={lines} label="Sản phẩm trong đơn" />
        <CouponBox />
        <OrderTotals {...totals} />
        {note ? (
          <p role="status" className="text-sm text-coffee-700">
            {note}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
