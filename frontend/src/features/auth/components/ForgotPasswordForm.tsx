"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { forgotPassword } from "../api";
import { mapAuthError } from "../errors";
import { normalizeEmail, validateEmail } from "../validation";
import { AuthCard, authLinkClass } from "./AuthCard";
import { TextField } from "./Fields";
import { FormError, FormNotice } from "./FormError";

const FIELDS = ["email"] as const;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const emailErr = validateEmail(email);
    setFormError(undefined);
    setMessage(undefined);
    if (emailErr) {
      setErrors({ email: emailErr });
      document.getElementById("email")?.focus();
      return;
    }
    setErrors({});

    busy.current = true;
    setSubmitting(true);
    try {
      const res = await forgotPassword(normalizeEmail(email));
      // Luôn hiện thông báo chung của server, không tiết lộ email có tồn tại hay không.
      setMessage(res.message);
    } catch (err) {
      const mapped = mapAuthError(err, FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      description="Nhập email đăng ký, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <FormError>{formError}</FormError>
        <FormNotice>{message}</FormNotice>
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          readOnly={submitting}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Đang gửi..." : "Gửi hướng dẫn"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-coffee-800">
        <Link href="/dang-nhap" className={authLinkClass}>
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
