"use client";

import { PAYMENT_METHOD_LABEL } from "@/features/orders/labels";
import type { PaymentMethod, Quote } from "@/types/order";
import { RadioCard, Section } from "./RadioCard";

export function PaymentMethodSection({
  paymentMethods,
  paymentMethod,
  onSelect,
}: {
  paymentMethods: Quote["paymentMethods"];
  paymentMethod: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
}) {
  return (
    <Section title="Phương thức thanh toán" id="checkout-payment">
      <fieldset className="space-y-2">
        <legend className="sr-only">Chọn phương thức thanh toán</legend>
        {paymentMethods.map((p) => (
          <RadioCard
            key={p.method}
            name="paymentMethod"
            value={p.method}
            checked={paymentMethod === p.method}
            disabled={!p.enabled}
            onChange={(v) => onSelect(v as PaymentMethod)}
          >
            <span className="flex justify-between gap-3">
              <span className="font-medium text-coffee-900">{PAYMENT_METHOD_LABEL[p.method]}</span>
              {!p.enabled ? (
                <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-coffee-800">
                  Chưa khả dụng
                </span>
              ) : p.mock ? (
                <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-coffee-800">
                  Giả lập, không trừ tiền thật
                </span>
              ) : null}
            </span>
            {p.method === "BANK_TRANSFER" && p.enabled ? (
              <span className="mt-1 block text-sm text-coffee-700">
                Quét mã VietQR ở bước sau khi đặt hàng. Đơn được giữ chỗ trong thời gian chờ chuyển
                khoản.
              </span>
            ) : null}
          </RadioCard>
        ))}
      </fieldset>
    </Section>
  );
}
