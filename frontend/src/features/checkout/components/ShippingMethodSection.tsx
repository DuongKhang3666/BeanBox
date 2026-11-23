"use client";

import { Button } from "@/components/ui/Button";
import { orderErrorMessage } from "@/features/orders/labels";
import { ApiError } from "@/lib/api/errors";
import { formatDateRange, formatVND } from "@/lib/format";
import type { ShippingMethod, ShippingOption } from "@/types/order";
import type { useQuote } from "../useQuote";
import { RadioCard, Section } from "./RadioCard";

export function ShippingMethodSection({
  q,
  options,
  selected,
  onSelect,
}: {
  q: ReturnType<typeof useQuote>;
  options: ShippingOption[];
  selected: ShippingOption | null;
  onSelect: (method: ShippingMethod) => void;
}) {
  return (
    <Section title="Phương thức vận chuyển" id="checkout-shipping">
      {q.status === "none" ? (
        <p className="text-sm text-coffee-700">Chọn địa chỉ để tính phí vận chuyển.</p>
      ) : null}
      {q.status === "loading" ? (
        <p role="status" className="text-sm text-coffee-700">
          Đang tính phí vận chuyển...
        </p>
      ) : null}
      {q.status === "error" ? (
        <div role="alert" className="space-y-2 text-sm text-danger-600">
          <p>
            {q.error instanceof ApiError && q.error.code === "RATE_LIMITED"
              ? orderErrorMessage(q.error)
              : "Không tính được phí vận chuyển. Vui lòng thử lại."}
          </p>
          <Button variant="outline" size="sm" onClick={q.retry}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {options.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">Chọn phương thức vận chuyển</legend>
          {options.map((o) => (
            <RadioCard
              key={o.method}
              name="shippingMethod"
              value={o.method}
              checked={selected?.method === o.method}
              onChange={(v) => onSelect(v as ShippingMethod)}
            >
              <span className="flex justify-between gap-3">
                <span>
                  <span className="block font-medium text-coffee-900">{o.label}</span>
                  <span className="block text-sm text-coffee-700">
                    {o.eta
                      ? `Dự kiến giao ${formatDateRange(o.eta.fromDate, o.eta.toDate)}`
                      : `Dự kiến ${o.estimatedDays} ngày`}
                  </span>
                </span>
                <span className="text-right font-medium text-coffee-900">
                  {o.shippingDiscount > 0 ? (
                    <s className="mr-2 text-sm font-normal text-coffee-600">{formatVND(o.fee)}</s>
                  ) : null}
                  {o.payableFee === 0 ? (
                    <span className="text-moss-700">Miễn phí</span>
                  ) : (
                    formatVND(o.payableFee)
                  )}
                </span>
              </span>
            </RadioCard>
          ))}
        </fieldset>
      ) : null}
    </Section>
  );
}
