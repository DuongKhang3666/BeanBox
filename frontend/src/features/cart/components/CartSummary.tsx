"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { formatVND } from "@/lib/format";
import type { Cart } from "@/types/cart";
import { hasBlockingIssue } from "../messages";
import { CouponBox } from "./CouponBox";

export function CartSummary({ cart }: { cart: Cart }) {
  const blocked = hasBlockingIssue(cart.items);
  const { shippingEstimate: ship } = cart;
  const free = ship.standardFrom === 0 && cart.subtotal > 0;

  return (
    <aside
      aria-label="Tóm tắt đơn hàng"
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5 lg:sticky lg:top-24"
    >
      <h2 className="font-serif text-lg font-bold text-coffee-900">Tóm tắt đơn hàng</h2>
      <CouponBox />
      <dl className="space-y-2 text-coffee-900">
        <div className="flex justify-between">
          <dt>Tạm tính</dt>
          <dd>{formatVND(cart.subtotal)}</dd>
        </div>
        {cart.discountTotal > 0 ? (
          <div className="flex justify-between text-moss-700">
            <dt>Giảm giá</dt>
            <dd>-{formatVND(cart.discountTotal)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt>Phí vận chuyển</dt>
          <dd>{free ? "Miễn phí" : `Từ ${formatVND(ship.standardFrom)}`}</dd>
        </div>
        <div className="flex justify-between border-t border-coffee-200 pt-2 text-lg font-bold">
          <dt>Tổng tạm tính</dt>
          <dd>{formatVND(cart.subtotal - cart.discountTotal)}</dd>
        </div>
      </dl>
      {ship.freeShippingRemaining > 0 ? (
        <p className="rounded-lg bg-moss-50 px-3 py-2 text-sm text-moss-800">
          Mua thêm {formatVND(ship.freeShippingRemaining)} để được miễn phí vận chuyển tiêu chuẩn
        </p>
      ) : null}
      <p className="text-sm text-coffee-700">
        Phí vận chuyển chính xác được tính ở bước thanh toán.
      </p>
      {blocked ? (
        <>
          <Button size="lg" className="w-full" disabled aria-describedby="checkout-blocked">
            Tiến hành thanh toán
          </Button>
          <p id="checkout-blocked" role="status" className="text-sm text-danger-600">
            Vui lòng xóa hoặc giảm số lượng các sản phẩm hết hàng/không đủ hàng trước khi thanh
            toán.
          </p>
        </>
      ) : (
        <ButtonLink href="/thanh-toan" size="lg" className="w-full">
          Tiến hành thanh toán
        </ButtonLink>
      )}
    </aside>
  );
}
