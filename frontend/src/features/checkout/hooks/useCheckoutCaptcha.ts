import { useRef, useState } from "react";
import type { TurnstileHandle } from "@/features/content/components/TurnstileWidget";
import type { ContactCaptcha } from "@/types/settings";

/** Captcha (D-057): chỉ khách vãng lai. Token Turnstile dùng một lần nên reset sau mỗi lần gửi lỗi. */
export function useCheckoutCaptcha(authed: boolean, initialCaptcha: ContactCaptcha | null) {
  const [captcha, setCaptcha] = useState<ContactCaptcha | null>(initialCaptcha);
  const [token, setToken] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const needCaptcha = !authed && captcha !== null;
  return { captcha, setCaptcha, token, setToken, broken, setBroken, turnstile, needCaptcha };
}

export type CheckoutCaptcha = ReturnType<typeof useCheckoutCaptcha>;
