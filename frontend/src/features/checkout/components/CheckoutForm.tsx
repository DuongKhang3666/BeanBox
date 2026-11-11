"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { listAddresses } from "@/features/account/api";
import { LocationFields, type LocationValues } from "@/features/account/components/LocationFields";
import { TextField } from "@/features/auth/components/Fields";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import { FormError } from "@/features/auth/components/FormError";
import { normalizePhone } from "@/features/auth/validation";
import { useCart } from "@/features/cart/CartProvider";
import { cartErrorMessage, couponReasonMessage } from "@/features/cart/messages";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { Address } from "@/types/account";
import type { User } from "@/types/auth";
import type { Cart } from "@/types/cart";
import type { PaymentMethod, PlaceOrderRequest, Quote, ShippingMethod } from "@/types/order";
import { placeOrder } from "@/features/orders/api";
import { IdempotencyKeys } from "@/features/orders/idempotency";
import { PAYMENT_METHOD_LABEL, orderErrorMessage } from "@/features/orders/labels";
import { createStripeSession, createVnpayPayment } from "@/features/payments/api";
import { goToPayment } from "@/features/payments/redirect";
import type { OrderLine } from "@/features/orders/components/OrderItemsList";
import { useResource } from "@/features/orders/useResource";
import {
  DEFAULT_PAYMENT_METHODS,
  FIELD_ORDER,
  NOTE_MAX,
  buildQuoteRequest,
  cartSignature,
  mapOrderFieldErrors,
  validateCheckout,
} from "../logic";
import { useQuote } from "../useQuote";
import { CheckoutSummary } from "./CheckoutSummary";
import { RadioCard, Section } from "./RadioCard";

export const LAST_ORDER_KEY = "bb_last_order";
const NEW_ADDRESS = "__new__";

const loadAddresses = () => listAddresses();

type Problem = {
  message: string;
  /** Hành động kèm theo thông báo. */
  action?: "removeCoupon" | "cart";
};

function quoteLines(cart: Cart, quote: Quote | undefined): OrderLine[] {
  return (quote?.items ?? cart.items).map((i) => ({
    key: i.id,
    productName: i.product.name,
    variantName: i.variant.name,
    imageUrl: i.product.imageUrl,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  }));
}

function AddressRadioLabel({ a }: { a: Address }) {
  return (
    <>
      <span className="block font-medium text-coffee-900">
        {a.fullName} · {a.phone}
        {a.isDefault ? (
          <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-xs">Mặc định</span>
        ) : null}
      </span>
      <span className="block text-sm text-coffee-800">
        {a.line1}, {a.wardName}, {a.provinceName}
      </span>
    </>
  );
}

export function CheckoutForm({
  cart,
  user,
  onPlaced,
}: {
  cart: Cart;
  user: User | null;
  onPlaced: () => void;
}) {
  const authed = !!user;
  const router = useRouter();
  const { reload, removeCoupon, pending } = useCart();

  // Liên hệ
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Địa chỉ
  const addressRes = useResource(authed ? "addresses" : null, loadAddresses);
  const addresses = useMemo(() => addressRes.data ?? [], [addressRes.data]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [shipName, setShipName] = useState(user?.fullName ?? "");
  const [shipPhone, setShipPhone] = useState(user?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [loc, setLoc] = useState<LocationValues>({ provinceCode: "", wardCode: "" });
  // Giao hàng / thanh toán / khác
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("STANDARD");
  const [chosenPayment, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [note, setNote] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alertTick, setAlertTick] = useState(0);
  const [removingCoupon, setRemovingCoupon] = useState(false);

  const inFlight = useRef(false);
  const keys = useRef(new IdempotencyKeys());
  const alertRef = useRef<HTMLDivElement>(null);

  // Chọn địa chỉ trong sổ hay nhập mới?
  const addressesReady = authed && addressRes.status === "ready";
  const useSaved = addressesReady && addresses.length > 0 && pickedId !== NEW_ADDRESS;
  const defaultId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
  const addressId = useSaved
    ? addresses.some((a) => a.id === pickedId)
      ? pickedId
      : defaultId
    : null;
  const showForm = !authed || (addressesReady && !useSaved);

  const quoteRequest = buildQuoteRequest({
    addressId,
    provinceCode: showForm ? loc.provinceCode : "",
    wardCode: showForm ? loc.wardCode : "",
    guestEmail: authed ? null : email,
  });
  const q = useQuote(quoteRequest, cartSignature(cart.items, cart.coupon), reload);
  const quote = q.quote;

  const options = quote?.shippingOptions ?? [];
  const selected = options.find((o) => o.method === shippingMethod) ?? options[0] ?? null;
  const paymentMethods = quote?.paymentMethods ?? DEFAULT_PAYMENT_METHODS;
  // Phương thức đang chọn bị tắt (quote mới) -> quay về COD.
  const paymentMethod: PaymentMethod = paymentMethods.some(
    (p) => p.method === chosenPayment && p.enabled,
  )
    ? chosenPayment
    : "COD";
  const hasIssues = (quote?.issues.length ?? 0) > 0;
  const invalidCoupon = quote?.coupon && quote.coupon.valid === false ? quote.coupon : null;

  // Sau lỗi lúc đặt hàng: focus ô lỗi đầu tiên, nếu không có thì focus khung thông báo.
  useEffect(() => {
    if (alertTick === 0) return;
    const hasField = FIELD_ORDER.some((id) => errors[id]);
    if (hasField) focusFirstInvalid(FIELD_ORDER, errors);
    else if (alertRef.current) {
      alertRef.current.focus();
      alertRef.current.scrollIntoView?.({ block: "center" });
    }
    // Chỉ chạy khi có yêu cầu mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertTick]);

  function clearError(...ids: string[]) {
    setErrors((prev) => {
      if (!ids.some((id) => id in prev)) return prev;
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  function buildPayload(): PlaceOrderRequest | null {
    if (!selected) return null;
    const contact: PlaceOrderRequest["contact"] = authed
      ? phone.trim()
        ? { phone: normalizePhone(phone) }
        : undefined
      : { email: email.trim().toLowerCase(), phone: normalizePhone(phone) };
    return {
      ...(contact ? { contact } : {}),
      ...(addressId
        ? { addressId }
        : {
            shippingAddress: {
              fullName: shipName.trim(),
              phone: normalizePhone(shipPhone),
              provinceCode: loc.provinceCode,
              wardCode: loc.wardCode,
              line1: line1.trim(),
            },
          }),
      shippingMethod: selected.method,
      paymentMethod,
      ...(note.trim() ? { note: note.trim() } : {}),
      acceptTerms: true,
      expectedTotal: selected.grandTotal,
    };
  }

  function handleError(err: unknown) {
    if (err instanceof ApiError) {
      switch (err.code) {
        case "PRICE_CHANGED": {
          const d = err.details as { grandTotal?: unknown; quote?: Quote } | undefined;
          if (d?.quote && Array.isArray(d.quote.shippingOptions)) q.replace(d.quote);
          const newTotal =
            typeof d?.grandTotal === "number"
              ? d.grandTotal
              : d?.quote?.shippingOptions?.find((o) => o.method === shippingMethod)?.grandTotal;
          setProblem({
            message:
              typeof newTotal === "number"
                ? `Tổng tiền đã thay đổi thành ${formatVND(newTotal)}, vui lòng kiểm tra và bấm Đặt hàng lần nữa.`
                : orderErrorMessage(err),
          });
          return;
        }
        case "OUT_OF_STOCK":
        case "ITEM_UNAVAILABLE":
          reload();
          setProblem({ message: orderErrorMessage(err), action: "cart" });
          return;
        case "COUPON_INVALID":
          setProblem({ message: orderErrorMessage(err), action: "removeCoupon" });
          return;
        case "CART_EMPTY":
          reload();
          setProblem({ message: orderErrorMessage(err), action: "cart" });
          return;
        case "VALIDATION_ERROR": {
          const { fieldErrors, extra } = mapOrderFieldErrors(err.details);
          setErrors(fieldErrors);
          if (extra || Object.keys(fieldErrors).length === 0) {
            setProblem({ message: extra ?? "Vui lòng kiểm tra lại thông tin đơn hàng." });
          }
          return;
        }
      }
    }
    setProblem({ message: orderErrorMessage(err) });
  }

  /** Tạo phiên thanh toán và chuyển hướng. Khách chưa đăng nhập gửi SĐT đã nhập. */
  async function openPayment(code: string, method: PaymentMethod): Promise<boolean> {
    try {
      const input = { code, ...(authed ? {} : { phone: normalizePhone(phone) }) };
      const session =
        method === "VNPAY" ? await createVnpayPayment(input) : await createStripeSession(input);
      return goToPayment(session.redirectUrl);
    } catch {
      return false;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setProblem(null);

    const fe = validateCheckout({
      authed,
      email,
      phone,
      addressId,
      address: {
        fullName: shipName,
        phone: shipPhone,
        line1,
        provinceCode: loc.provinceCode,
        wardCode: loc.wardCode,
      },
      acceptTerms,
      note,
    });
    if (authed && !addressId && !showForm) fe.addressId = "Vui lòng chọn địa chỉ giao hàng";
    setErrors(fe);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELD_ORDER, fe);
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      setProblem({
        message:
          q.status === "loading"
            ? "Đang tính phí vận chuyển, vui lòng đợi giây lát rồi đặt hàng lại."
            : "Chưa tính được phí vận chuyển. Vui lòng thử lại.",
      });
      setAlertTick((t) => t + 1);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    const key = keys.current.keyFor(JSON.stringify(payload));
    try {
      const order = await placeOrder(payload, key);
      keys.current.reset();
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        /* sessionStorage không khả dụng: trang thành công sẽ hướng dẫn tra cứu */
      }
      onPlaced();
      reload();
      const successUrl = `/dat-hang-thanh-cong/${encodeURIComponent(order.code)}`;
      if (order.status === "PENDING_PAYMENT" && order.paymentMethod !== "COD") {
        const opened = await openPayment(order.code, order.paymentMethod);
        // Không mở được cổng: tới trang đơn hàng, có thông báo và nút "Thanh toán lại".
        if (!opened) router.push(`${successUrl}?pay=failed`);
        return;
      }
      router.push(successUrl);
    } catch (err) {
      keys.current.onError(err);
      handleError(err);
      setAlertTick((t) => t + 1);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function onRemoveCoupon() {
    setRemovingCoupon(true);
    try {
      await removeCoupon();
      setProblem(null);
    } catch (err) {
      setProblem({ message: cartErrorMessage(err), action: "removeCoupon" });
    } finally {
      setRemovingCoupon(false);
    }
  }

  const totals = selected
    ? {
        subtotal: quote!.subtotal,
        discountTotal: quote!.discountTotal,
        shippingFee: selected.fee,
        shippingDiscount: selected.shippingDiscount,
        grandTotal: selected.grandTotal,
      }
    : {
        subtotal: cart.subtotal,
        discountTotal: cart.discountTotal,
        shippingFee: null,
        grandTotal: null,
        shippingPendingText: "Chọn địa chỉ để tính phí vận chuyển",
      };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
      <div className="lg:col-start-2 lg:row-start-1">
        <CheckoutSummary
          lines={quoteLines(cart, quote)}
          totals={totals}
          note={q.status === "loading" ? "Đang cập nhật phí vận chuyển..." : undefined}
        />
      </div>
      <div className="lg:col-start-1 lg:row-start-1">
        <form onSubmit={onSubmit} noValidate aria-busy={submitting} className="space-y-6">
          {problem ? (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-sm text-danger-600"
            >
              <p>{problem.message}</p>
              {problem.action === "removeCoupon" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRemoveCoupon}
                  loading={removingCoupon || pending.coupon}
                >
                  Bỏ mã
                </Button>
              ) : null}
              {problem.action === "cart" ? (
                <Link href="/gio-hang" className="font-medium underline">
                  Quay lại giỏ hàng
                </Link>
              ) : null}
            </div>
          ) : null}

          <Section title="Thông tin liên hệ" id="checkout-contact">
            {authed ? (
              <>
                <div>
                  <Label htmlFor="contactEmailRO">Email</Label>
                  <input
                    id="contactEmailRO"
                    value={user?.email ?? ""}
                    readOnly
                    className="h-11 w-full rounded-lg border border-coffee-300 bg-coffee-50 px-3 text-base text-coffee-800"
                  />
                </div>
                <TextField
                  id="contactPhone"
                  label="Số điện thoại liên hệ (không bắt buộc)"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  hint="Nếu bỏ trống, chúng tôi dùng số điện thoại của địa chỉ nhận hàng."
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearError("contactPhone");
                  }}
                  error={errors.contactPhone}
                />
              </>
            ) : (
              <>
                <TextField
                  id="contactEmail"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("contactEmail");
                  }}
                  error={errors.contactEmail}
                  required
                />
                <TextField
                  id="contactPhone"
                  label="Số điện thoại"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearError("contactPhone");
                  }}
                  error={errors.contactPhone}
                  required
                />
              </>
            )}
          </Section>

          <Section title="Địa chỉ giao hàng" id="checkout-address">
            {authed && addressRes.status === "loading" ? (
              <div aria-busy="true" aria-label="Đang tải sổ địa chỉ" className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : null}
            {authed && addressRes.status === "error" ? (
              <div role="alert" className="space-y-2 text-sm text-danger-600">
                <p>Không tải được sổ địa chỉ.</p>
                <Button variant="outline" size="sm" onClick={addressRes.retry}>
                  Thử lại
                </Button>
              </div>
            ) : null}
            {useSaved ? (
              <fieldset id="addressId" tabIndex={-1} className="space-y-2">
                <legend className="sr-only">Chọn địa chỉ giao hàng</legend>
                {addresses.map((a) => (
                  <RadioCard
                    key={a.id}
                    name="address"
                    value={a.id}
                    checked={addressId === a.id}
                    onChange={(v) => {
                      setPickedId(v);
                      clearError("addressId");
                    }}
                  >
                    <AddressRadioLabel a={a} />
                  </RadioCard>
                ))}
                <RadioCard
                  name="address"
                  value={NEW_ADDRESS}
                  checked={false}
                  onChange={setPickedId}
                >
                  <span className="font-medium text-coffee-900">Giao tới địa chỉ khác</span>
                </RadioCard>
                <FieldError>{errors.addressId}</FieldError>
              </fieldset>
            ) : null}
            {showForm ? (
              <div className="space-y-4">
                {authed && addresses.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setPickedId(null)}>
                    ← Dùng địa chỉ trong sổ
                  </Button>
                ) : null}
                <TextField
                  id="shipFullName"
                  label="Họ và tên người nhận"
                  autoComplete="name"
                  value={shipName}
                  onChange={(e) => {
                    setShipName(e.target.value);
                    clearError("shipFullName");
                  }}
                  error={errors.shipFullName}
                  required
                />
                <TextField
                  id="shipPhone"
                  label="Số điện thoại người nhận"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={shipPhone}
                  onChange={(e) => {
                    setShipPhone(e.target.value);
                    clearError("shipPhone");
                  }}
                  error={errors.shipPhone}
                  required
                />
                <LocationFields
                  values={loc}
                  errors={errors}
                  onChange={(next) => {
                    setLoc(next);
                    clearError("provinceCode", "wardCode");
                  }}
                />
                <TextField
                  id="shipLine1"
                  label="Địa chỉ cụ thể (số nhà, đường)"
                  autoComplete="address-line1"
                  value={line1}
                  onChange={(e) => {
                    setLine1(e.target.value);
                    clearError("shipLine1");
                  }}
                  error={errors.shipLine1}
                  required
                />
              </div>
            ) : null}
          </Section>

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
                    onChange={(v) => setShippingMethod(v as ShippingMethod)}
                  >
                    <span className="flex justify-between gap-3">
                      <span>
                        <span className="block font-medium text-coffee-900">{o.label}</span>
                        <span className="block text-sm text-coffee-700">
                          Dự kiến {o.estimatedDays} ngày
                        </span>
                      </span>
                      <span className="text-right font-medium text-coffee-900">
                        {o.shippingDiscount > 0 ? (
                          <s className="mr-2 text-sm font-normal text-coffee-600">
                            {formatVND(o.fee)}
                          </s>
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
                  onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                >
                  <span className="flex justify-between gap-3">
                    <span className="font-medium text-coffee-900">
                      {PAYMENT_METHOD_LABEL[p.method]}
                    </span>
                    {!p.enabled ? (
                      <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-coffee-800">
                        Chưa khả dụng
                      </span>
                    ) : null}
                  </span>
                </RadioCard>
              ))}
            </fieldset>
          </Section>

          <Section title="Ghi chú" id="checkout-note">
            <div>
              <Label htmlFor="note">Ghi chú cho đơn hàng (không bắt buộc)</Label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  clearError("note");
                }}
                maxLength={NOTE_MAX}
                rows={3}
                aria-invalid={errors.note ? true : undefined}
                className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900"
                placeholder="Ví dụ: gọi trước khi giao"
              />
              <p className="mt-1 text-right text-xs text-coffee-700">
                {note.length}/{NOTE_MAX}
              </p>
              <FieldError id="note-error">{errors.note}</FieldError>
            </div>
          </Section>

          {hasIssues ? (
            <FormError>
              Một số sản phẩm trong giỏ đã hết hàng hoặc không đủ số lượng. Vui lòng{" "}
              <Link href="/gio-hang" className="font-medium underline">
                quay lại giỏ hàng
              </Link>{" "}
              để điều chỉnh trước khi đặt hàng.
            </FormError>
          ) : null}

          {invalidCoupon ? (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-3 text-sm text-danger-600"
            >
              <p>
                Mã giảm giá {invalidCoupon.code} không còn hợp lệ.{" "}
                {couponReasonMessage(invalidCoupon.invalidReason, invalidCoupon.minOrder)} Vui lòng
                bỏ mã để tiếp tục đặt hàng.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRemoveCoupon}
                loading={removingCoupon || pending.coupon}
              >
                Bỏ mã
              </Button>
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="flex min-h-11 items-start gap-3 text-coffee-900">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptTerms}
                onChange={(e) => {
                  setAcceptTerms(e.target.checked);
                  clearError("acceptTerms");
                }}
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={errors.acceptTerms ? "acceptTerms-error" : undefined}
                className="mt-1 h-5 w-5 shrink-0 accent-moss-700"
              />
              <span>
                Tôi đã đọc và đồng ý với{" "}
                <Link
                  href="/chinh-sach/dieu-khoan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss-600"
                >
                  điều khoản mua hàng
                </Link>{" "}
                của BeanBox.
              </span>
            </label>
            <FieldError id="acceptTerms-error">{errors.acceptTerms}</FieldError>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={submitting}
              disabled={hasIssues || !!invalidCoupon}
            >
              {submitting
                ? "Đang đặt hàng..."
                : `Đặt hàng${selected ? ` · ${formatVND(selected.grandTotal)}` : ""}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
