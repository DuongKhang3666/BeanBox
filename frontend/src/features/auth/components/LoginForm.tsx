"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "../AuthProvider";
import { mapAuthError } from "../errors";
import { safeRedirect } from "../safeRedirect";
import { normalizeEmail, validateEmail, validateRequiredPassword } from "../validation";
import { AuthCard, authLinkClass } from "./AuthCard";
import { PasswordField, TextField } from "./Fields";
import { FormError } from "./FormError";
import { focusFirstInvalid } from "./focus";

const FIELDS = ["email", "password"] as const;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { status, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  // Đã đăng nhập mà vào trang này -> sang tài khoản. `busy` chặn xung đột với redirect sau khi submit.
  useEffect(() => {
    if (status === "authenticated" && !busy.current) router.replace("/tai-khoan");
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;

    const fe: Record<string, string> = {};
    const emailErr = validateEmail(email);
    const pwErr = validateRequiredPassword(password);
    if (emailErr) fe.email = emailErr;
    if (pwErr) fe.password = pwErr;
    setErrors(fe);
    setFormError(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      await login({ email: normalizeEmail(email), password });
      // TODO(M3): nếu có cart token thì gọi POST /cart/merge rồi xóa token local.
      router.replace(safeRedirect(params.get("next")));
    } catch (err) {
      const mapped = mapAuthError(err, FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      busy.current = false;
      setSubmitting(false);
    }
  }

  const registerHref = next ? `/dang-ky?next=${encodeURIComponent(next)}` : "/dang-ky";

  return (
    <AuthCard title="Đăng nhập" description="Chào mừng bạn quay lại BeanBox.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <FormError>{formError}</FormError>
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
        <PasswordField
          id="password"
          label="Mật khẩu"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          readOnly={submitting}
          required
        />
        <div className="text-right text-sm">
          <Link href="/quen-mat-khau" className={authLinkClass}>
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-coffee-800">
        Chưa có tài khoản?{" "}
        <Link href={registerHref} className={authLinkClass}>
          Đăng ký
        </Link>
      </p>
    </AuthCard>
  );
}
