import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import { normalizePhone } from "@/features/auth/validation";
import { useCart } from "@/features/cart/CartProvider";
import { fetchContactCaptcha } from "@/features/content/contactCaptcha";
import { placeOrder } from "@/features/orders/api";
import { IdempotencyKeys } from "@/features/orders/idempotency";
import { orderErrorMessage } from "@/features/orders/labels";
import { createOnlinePayment } from "@/features/payments/api";
import { goToPayment } from "@/features/payments/redirect";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type {
  PaymentMethod,
  PlaceOrderRequest,
  Quote,
  ShippingMethod,
  ShippingOption,
} from "@/types/order";
import { FIELD_ORDER, mapOrderFieldErrors, validateCheckout } from "../logic";
import type { useQuote } from "../useQuote";
import type { CheckoutAddress } from "./useCheckoutAddress";
import type { CheckoutCaptcha } from "./useCheckoutCaptcha";

export const LAST_ORDER_KEY = "bb_last_order";
const CAPTCHA_REQUIRED_ERROR = "Vui lòng hoàn tất bước xác minh trước khi đặt hàng.";
const CAPTCHA_UNAVAILABLE_ERROR = "Hiện chưa xác minh được, vui lòng thử lại sau ít phút.";

export type Problem = {
  message: string;
  /** Hành động kèm theo thông báo. */
  action?: "removeCoupon" | "cart";
};

export interface CheckoutSubmitInput {
  authed: boolean;
  email: string;
  phone: string;
  note: string;
  acceptTerms: boolean;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  /** Lựa chọn vận chuyển đang áp dụng (null = chưa tính được phí). */
  selected: ShippingOption | null;
  address: CheckoutAddress;
  captcha: CheckoutCaptcha;
  q: ReturnType<typeof useQuote>;
  onPlaced: () => void;
}

/**
 * Luồng đặt hàng: validate -> captcha -> Idempotency-Key -> POST -> chuyển trang/cổng thanh toán,
 * và ánh xạ lỗi (PRICE_CHANGED, OUT_OF_STOCK, COUPON_INVALID, VALIDATION_ERROR, CAPTCHA_FAILED...).
 * Sau lỗi: focus ô lỗi đầu tiên, nếu không có thì focus khung thông báo.
 */
export function useCheckoutSubmit(input: CheckoutSubmitInput) {
  const { authed, email, phone, note, acceptTerms, shippingMethod, paymentMethod, selected } =
    input;
  const { address, captcha, q, onPlaced } = input;
  const { addressId, showForm, shipName, shipPhone, line1, loc } = address;
  const { needCaptcha, turnstile, setCaptcha, token: captchaToken } = captcha;
  const router = useRouter();
  const { reload } = useCart();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alertTick, setAlertTick] = useState(0);
  const inFlight = useRef(false);
  const keys = useRef(new IdempotencyKeys());
  const alertRef = useRef<HTMLDivElement>(null);

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

  /** Server báo lỗi captcha: báo người dùng, lấy token mới; nếu đang không hiện widget thì nạp lại cấu hình. */
  async function handleCaptchaError(err: ApiError) {
    const unavailable = err.code === "SERVICE_UNAVAILABLE";
    setProblem({ message: unavailable ? CAPTCHA_UNAVAILABLE_ERROR : orderErrorMessage(err) });
    turnstile.current?.reset();
    if (!needCaptcha) {
      const latest = await fetchContactCaptcha();
      if (latest) setCaptcha(latest);
    }
  }

  function handleError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === "CAPTCHA_FAILED" || (err.status === 503 && needCaptcha)) {
        void handleCaptchaError(err);
        return;
      }
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
      if (method === "COD" || method === "BANK_TRANSFER") return false;
      const session = await createOnlinePayment(method, input);
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
    if (needCaptcha && !captchaToken) {
      setProblem({ message: CAPTCHA_REQUIRED_ERROR });
      setAlertTick((t) => t + 1);
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
    // Idempotency-Key gắn với payload KHÔNG gồm token: gửi lại sau lỗi mạng với token mới vẫn cùng key.
    const key = keys.current.keyFor(JSON.stringify(payload));
    const body: PlaceOrderRequest =
      needCaptcha && captchaToken ? { ...payload, captchaToken } : payload;
    try {
      const order = await placeOrder(body, key);
      keys.current.reset();
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        /* sessionStorage không khả dụng: trang thành công sẽ hướng dẫn tra cứu */
      }
      onPlaced();
      reload();
      const successUrl = `/dat-hang-thanh-cong/${encodeURIComponent(order.code)}`;
      // Chuyển khoản (D-061) đi thẳng trang thành công có QR; chỉ cổng online mới chuyển hướng.
      if (
        order.status === "PENDING_PAYMENT" &&
        order.paymentMethod !== "COD" &&
        order.paymentMethod !== "BANK_TRANSFER"
      ) {
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
      // Token đã dùng (kể cả khi đơn bị từ chối vì lý do khác): cần token mới cho lần gửi sau.
      if (needCaptcha && !(err instanceof ApiError && err.code === "CAPTCHA_FAILED")) {
        turnstile.current?.reset();
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return { errors, setErrors, clearError, problem, setProblem, submitting, alertRef, onSubmit };
}
