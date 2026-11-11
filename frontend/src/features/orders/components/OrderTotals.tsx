import { formatVND } from "@/lib/format";

export interface OrderTotalsProps {
  subtotal: number;
  discountTotal: number;
  /** Phí gốc (`fee`). null = chưa tính (chưa chọn địa chỉ). */
  shippingFee: number | null;
  shippingDiscount?: number;
  /** null = chưa có tổng cuối, hiển thị "Tổng tạm tính". */
  grandTotal: number | null;
  /** Hiển thị thay cho phí vận chuyển khi `shippingFee` là null. */
  shippingPendingText?: string;
}

export function OrderTotals({
  subtotal,
  discountTotal,
  shippingFee,
  shippingDiscount = 0,
  grandTotal,
  shippingPendingText = "Chưa tính",
}: OrderTotalsProps) {
  const payable = shippingFee === null ? null : Math.max(0, shippingFee - shippingDiscount);
  const total = grandTotal ?? subtotal - discountTotal;

  return (
    <dl className="space-y-2 text-coffee-900">
      <div className="flex justify-between gap-3">
        <dt>Tạm tính</dt>
        <dd>{formatVND(subtotal)}</dd>
      </div>
      {discountTotal > 0 ? (
        <div className="flex justify-between gap-3 text-moss-700">
          <dt>Giảm giá</dt>
          <dd>-{formatVND(discountTotal)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt>Phí vận chuyển</dt>
        <dd className="text-right">
          {shippingFee === null ? (
            <span className="text-sm text-coffee-700">{shippingPendingText}</span>
          ) : (
            <>
              {shippingDiscount > 0 ? (
                <s className="mr-2 text-coffee-600">{formatVND(shippingFee)}</s>
              ) : null}
              {payable === 0 ? (
                <span className="font-medium text-moss-700">Miễn phí</span>
              ) : (
                formatVND(payable ?? 0)
              )}
            </>
          )}
        </dd>
      </div>
      <div className="flex justify-between gap-3 border-t border-coffee-200 pt-2 text-lg font-bold">
        <dt>{grandTotal === null ? "Tổng tạm tính" : "Tổng cộng"}</dt>
        <dd>{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
