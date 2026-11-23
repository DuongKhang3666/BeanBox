"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Input";
import { TurnstileWidget } from "@/features/content/components/TurnstileWidget";
import { formatVND } from "@/lib/format";
import type { ShippingOption } from "@/types/order";
import type { CheckoutCaptcha } from "../hooks/useCheckoutCaptcha";

/** Đồng ý điều khoản, captcha (khách vãng lai) và nút "Đặt hàng". */
export function CheckoutSubmitBar({
  acceptTerms,
  setAcceptTerms,
  termsError,
  clearError,
  captcha,
  selected,
  submitting,
  blocked,
}: {
  acceptTerms: boolean;
  setAcceptTerms: (v: boolean) => void;
  termsError?: string;
  clearError: (...ids: string[]) => void;
  captcha: CheckoutCaptcha;
  selected: ShippingOption | null;
  submitting: boolean;
  /** Có sản phẩm lỗi hoặc mã giảm giá không hợp lệ. */
  blocked: boolean;
}) {
  const { captcha: config, needCaptcha, token, setToken, broken, setBroken, turnstile } = captcha;
  return (
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
          aria-invalid={termsError ? true : undefined}
          aria-describedby={termsError ? "acceptTerms-error" : undefined}
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
      <FieldError id="acceptTerms-error">{termsError}</FieldError>
      {needCaptcha && config ? (
        <div className="space-y-2">
          <TurnstileWidget
            ref={turnstile}
            siteKey={config.siteKey}
            onToken={setToken}
            onUnavailable={() => setBroken(true)}
          />
          {broken ? (
            <p role="alert" className="text-sm text-danger-600">
              Không tải được bước xác minh (có thể do trình duyệt hoặc tiện ích đang chặn). Bạn có
              thể tải lại trang hoặc liên hệ cửa hàng để được hỗ trợ đặt hàng.
            </p>
          ) : null}
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={blocked || (needCaptcha && !token)}
      >
        {submitting
          ? "Đang đặt hàng..."
          : `Đặt hàng${selected ? ` · ${formatVND(selected.grandTotal)}` : ""}`}
      </Button>
    </div>
  );
}
