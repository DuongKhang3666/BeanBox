"use client";

import { useState } from "react";
import { useCart } from "@/features/cart/CartProvider";
import type { OrderLine } from "@/features/orders/components/OrderItemsList";
import type { User } from "@/types/auth";
import type { Cart } from "@/types/cart";
import type { PaymentMethod, Quote, ShippingMethod } from "@/types/order";
import type { ContactCaptcha } from "@/types/settings";
import { useCheckoutAddress } from "../hooks/useCheckoutAddress";
import { useCheckoutCaptcha } from "../hooks/useCheckoutCaptcha";
import { useCheckoutSubmit } from "../hooks/useCheckoutSubmit";
import { useCouponRemoval } from "../hooks/useCouponRemoval";
import { DEFAULT_PAYMENT_METHODS, buildQuoteRequest, cartSignature } from "../logic";
import { useQuote } from "../useQuote";
import { AddressSection } from "./AddressSection";
import { InvalidCouponNotice, IssuesNotice, ProblemAlert } from "./CheckoutAlerts";
import { CheckoutSubmitBar } from "./CheckoutSubmitBar";
import { CheckoutSummary } from "./CheckoutSummary";
import { ContactSection } from "./ContactSection";
import { NoteSection } from "./NoteSection";
import { PaymentMethodSection } from "./PaymentMethodSection";
import { ShippingMethodSection } from "./ShippingMethodSection";

// Luồng đặt hàng nằm ở ../hooks/useCheckoutSubmit (D-074); khóa sessionStorage giữ export ở đây cho nơi đã import.
export { LAST_ORDER_KEY } from "../hooks/useCheckoutSubmit";

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

export function CheckoutForm({
  cart,
  user,
  captcha: initialCaptcha = null,
  onPlaced,
}: {
  cart: Cart;
  user: User | null;
  /** Từ GET /settings/public; null = captcha tắt. Chỉ dùng cho khách vãng lai (D-057). */
  captcha?: ContactCaptcha | null;
  onPlaced: () => void;
}) {
  const authed = !!user;
  const { reload } = useCart();

  // Liên hệ
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Giao hàng / thanh toán / khác
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("STANDARD");
  const [chosenPayment, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [note, setNote] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const address = useCheckoutAddress(authed, user);
  const captcha = useCheckoutCaptcha(authed, initialCaptcha);
  const { addressId, showForm, loc } = address;

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

  const { errors, clearError, problem, setProblem, submitting, alertRef, onSubmit } =
    useCheckoutSubmit({
      authed,
      email,
      phone,
      note,
      acceptTerms,
      shippingMethod,
      paymentMethod,
      selected,
      address,
      captcha,
      q,
      onPlaced,
    });
  const { onRemoveCoupon, couponBusy } = useCouponRemoval(setProblem);

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
            <ProblemAlert
              problem={problem}
              alertRef={alertRef}
              onRemoveCoupon={onRemoveCoupon}
              couponBusy={couponBusy}
            />
          ) : null}

          <ContactSection
            authed={authed}
            user={user}
            email={email}
            setEmail={setEmail}
            phone={phone}
            setPhone={setPhone}
            errors={errors}
            clearError={clearError}
          />
          <AddressSection
            authed={authed}
            address={address}
            errors={errors}
            clearError={clearError}
          />
          <ShippingMethodSection
            q={q}
            options={options}
            selected={selected}
            onSelect={setShippingMethod}
          />
          <PaymentMethodSection
            paymentMethods={paymentMethods}
            paymentMethod={paymentMethod}
            onSelect={setPaymentMethod}
          />
          <NoteSection note={note} setNote={setNote} error={errors.note} clearError={clearError} />

          {hasIssues ? <IssuesNotice /> : null}
          {invalidCoupon ? (
            <InvalidCouponNotice
              coupon={invalidCoupon}
              onRemoveCoupon={onRemoveCoupon}
              couponBusy={couponBusy}
            />
          ) : null}

          <CheckoutSubmitBar
            acceptTerms={acceptTerms}
            setAcceptTerms={setAcceptTerms}
            termsError={errors.acceptTerms}
            clearError={clearError}
            captcha={captcha}
            selected={selected}
            submitting={submitting}
            blocked={hasIssues || !!invalidCoupon}
          />
        </form>
      </div>
    </div>
  );
}
