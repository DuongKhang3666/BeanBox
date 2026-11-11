"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/features/auth/components/Fields";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { isValidPhone, normalizePhone } from "@/features/auth/validation";
import { PayAgainButton } from "@/features/payments/components/PayAgainButton";
import { ApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import type { TrackedOrder } from "@/types/order";
import { cancelGuestOrder, trackOrder } from "../api";
import {
  ORDER_CODE_RE,
  normalizeOrderCode,
  orderErrorMessage,
  paymentMethodLabel,
  paymentStatusLabel,
  rateLimitedMessage,
  shippingMethodLabel,
} from "../labels";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { OrderItemsList } from "./OrderItemsList";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderTimeline } from "./OrderTimeline";
import { OrderTotals } from "./OrderTotals";

export const NOT_FOUND_MESSAGE =
  "Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại.";
const FIELDS = ["code", "phone"] as const;
const ACCOUNT_CANCELLABLE: readonly string[] = ["PENDING_PAYMENT", "PENDING", "CONFIRMED"];

function trackErrorMessage(err: unknown): { form?: string; fields?: Record<string, string> } {
  if (err instanceof ApiError) {
    if (err.status === 404) return { form: NOT_FOUND_MESSAGE };
    if (err.code === "RATE_LIMITED") return { form: rateLimitedMessage(err) };
    if (err.code === "VALIDATION_ERROR") {
      const fields: Record<string, string> = {};
      if (Array.isArray(err.details)) {
        for (const d of err.details as Array<{ field?: unknown; message?: unknown }>) {
          if (
            typeof d?.field === "string" &&
            typeof d?.message === "string" &&
            (FIELDS as readonly string[]).includes(d.field) &&
            !(d.field in fields)
          ) {
            fields[d.field] = d.message;
          }
        }
      }
      if (Object.keys(fields).length > 0) return { fields };
      return { form: err.message || "Dữ liệu không hợp lệ" };
    }
    if (err.code === "NETWORK_ERROR") return { form: orderErrorMessage(err) };
  }
  return { form: "Không thể tra cứu đơn hàng lúc này. Vui lòng thử lại." };
}

export function TrackOrder() {
  const params = useSearchParams();
  const [code, setCode] = useState(() => normalizeOrderCode(params.get("code") ?? ""));
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ order: TrackedOrder; phone: string } | null>(null);
  const busy = useRef(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const c = normalizeOrderCode(code);
    const fe: Record<string, string> = {};
    if (!c) fe.code = "Vui lòng nhập mã đơn hàng";
    else if (!ORDER_CODE_RE.test(c)) fe.code = "Mã đơn không đúng định dạng (ví dụ BB-261110-K7QP)";
    if (!phone.trim()) fe.phone = "Vui lòng nhập số điện thoại đặt hàng";
    else if (!isValidPhone(phone)) fe.phone = "Số điện thoại không hợp lệ (ví dụ 0901234567)";
    setErrors(fe);
    setFormError(undefined);
    setNotice(undefined);
    if (Object.keys(fe).length > 0) {
      setResult(null);
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setLoading(true);
    const p = normalizePhone(phone);
    try {
      const order = await trackOrder(c, p);
      setResult({ order, phone: p });
    } catch (err) {
      setResult(null);
      const m = trackErrorMessage(err);
      if (m.fields) setErrors(m.fields);
      setFormError(m.form);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function onCancel(reason: string) {
    if (!result || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    const { order, phone: p } = result;
    try {
      const cancelled = await cancelGuestOrder(order.code, {
        ...(reason ? { reason } : {}),
        phone: p,
      });
      setResult({ order: cancelled, phone: p });
    } catch (err) {
      setCancelError(orderErrorMessage(err));
      setCancelBusy(false);
      return;
    }
    setNotice("Đã hủy đơn hàng thành công.");
    setCancelOpen(false);
    setCancelBusy(false);
  }

  const order = result?.order;

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={loading}
        className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-6"
      >
        <FormError>{formError}</FormError>
        <TextField
          id="code"
          label="Mã đơn hàng"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={errors.code}
          hint="Ví dụ: BB-261110-K7QP. Mã có trong email xác nhận đơn hàng."
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        <TextField
          id="phone"
          label="Số điện thoại đặt hàng"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          required
        />
        <Button type="submit" loading={loading} className="w-full sm:w-auto">
          {loading ? "Đang tra cứu..." : "Tra cứu"}
        </Button>
      </form>

      <FormNotice>{notice}</FormNotice>

      {order ? (
        <section aria-label="Kết quả tra cứu" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
            <div>
              <p className="text-sm text-coffee-700">Đơn hàng</p>
              <p className="font-mono text-xl font-bold text-coffee-900">{order.code}</p>
              <p className="text-sm text-coffee-700">Đặt lúc {formatDateTime(order.createdAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <OrderStatusBadge status={order.status} />
              {order.canCancel ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setCancelError(null);
                    setCancelOpen(true);
                  }}
                >
                  Hủy đơn
                </Button>
              ) : null}
            </div>
            {order.canPay && result ? (
              <div className="basis-full rounded-lg bg-moss-50 p-3">
                <p className="mb-2 text-sm font-medium text-coffee-900">
                  Đơn hàng đang chờ thanh toán.
                </p>
                <PayAgainButton
                  code={order.code}
                  method={order.paymentMethod}
                  expiresAt={order.expiresAt}
                  phone={result.phone}
                />
              </div>
            ) : null}
            {!order.canCancel && ACCOUNT_CANCELLABLE.includes(order.status) ? (
              <p className="basis-full text-sm text-coffee-700">
                Đơn này được đặt bằng tài khoản. Vui lòng đăng nhập và hủy trong mục{" "}
                <Link
                  href="/tai-khoan/don-hang"
                  className="font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600"
                >
                  Đơn hàng của tôi
                </Link>
                .
              </p>
            ) : null}
          </div>

          <dl className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 text-coffee-900 sm:grid-cols-2 sm:p-5">
            <div>
              <dt className="text-sm text-coffee-700">Giao tới</dt>
              <dd>
                {order.shippingAddress.wardName}, {order.shippingAddress.provinceName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-coffee-700">Thanh toán</dt>
              <dd>
                {paymentMethodLabel(order.paymentMethod)} ·{" "}
                {paymentStatusLabel(order.paymentStatus)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-coffee-700">Vận chuyển</dt>
              <dd>{shippingMethodLabel(order.shippingMethod)}</dd>
            </div>
            {order.trackingNumber ? (
              <div>
                <dt className="text-sm text-coffee-700">Mã vận đơn</dt>
                <dd>
                  {order.trackingNumber}
                  {order.carrier ? ` (${order.carrier})` : ""}
                </dd>
              </div>
            ) : null}
            {order.cancelReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm text-coffee-700">Lý do hủy</dt>
                <dd>{order.cancelReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
            <h2 className="font-serif text-lg font-bold text-coffee-900">Sản phẩm</h2>
            <OrderItemsList
              label="Sản phẩm trong đơn"
              items={order.items.map((i, idx) => ({
                key: `${idx}-${i.productName}-${i.variantName}`,
                ...i,
              }))}
            />
            <OrderTotals
              subtotal={order.subtotal}
              discountTotal={order.discountTotal}
              shippingFee={order.shippingFee}
              shippingDiscount={order.shippingDiscount}
              grandTotal={order.grandTotal}
            />
          </div>

          {order.history.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
              <h2 className="font-serif text-lg font-bold text-coffee-900">Lịch sử đơn hàng</h2>
              <OrderTimeline history={order.history} />
            </div>
          ) : null}
        </section>
      ) : null}

      {cancelOpen && order ? (
        <CancelOrderDialog
          code={order.code}
          busy={cancelBusy}
          error={cancelError}
          onConfirm={onCancel}
          onCancel={() => setCancelOpen(false)}
        />
      ) : null}
    </div>
  );
}
