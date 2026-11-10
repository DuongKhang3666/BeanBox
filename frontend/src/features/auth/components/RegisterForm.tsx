"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "../AuthProvider";
import { mapAuthError } from "../errors";
import {
  PASSWORD_HINT,
  normalizeEmail,
  normalizePhone,
  validateEmail,
  validateFullName,
  validateOptionalPhone,
  validatePassword,
  validatePasswordConfirm,
} from "../validation";
import { AuthCard, authLinkClass } from "./AuthCard";
import { PasswordField, TextField } from "./Fields";
import { FormError } from "./FormError";
import { focusFirstInvalid } from "./focus";

const FIELDS = ["fullName", "email", "phone", "password", "confirmPassword"] as const;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { status, register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !busy.current) router.replace("/tai-khoan");
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;

    const fe: Record<string, string> = {};
    const checks: Array<[string, string | null]> = [
      ["fullName", validateFullName(fullName)],
      ["email", validateEmail(email)],
      ["phone", validateOptionalPhone(phone)],
      ["password", validatePassword(password)],
      ["confirmPassword", validatePasswordConfirm(password, confirm)],
    ];
    for (const [field, msg] of checks) if (msg) fe[field] = msg;
    setErrors(fe);
    setFormError(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: normalizeEmail(email),
        password,
        ...(phone.trim() ? { phone: normalizePhone(phone) } : {}),
      });
      // Đăng nhập luôn; server đã gửi email xác thực. Trang tài khoản (task sau) hiển thị thông báo theo cờ này.
      router.replace("/tai-khoan?registered=1");
    } catch (err) {
      const mapped = mapAuthError(err, FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      focusFirstInvalid(FIELDS, mapped.fieldErrors);
      busy.current = false;
      setSubmitting(false);
    }
  }

  const loginHref = next ? `/dang-nhap?next=${encodeURIComponent(next)}` : "/dang-nhap";

  return (
    <AuthCard
      title="Đăng ký"
      description="Tạo tài khoản để theo dõi đơn hàng và lưu địa chỉ giao hàng."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <FormError>{formError}</FormError>
        <TextField
          id="fullName"
          label="Họ và tên"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          readOnly={submitting}
          required
        />
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
        <TextField
          id="phone"
          label="Số điện thoại (không bắt buộc)"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          readOnly={submitting}
          hint="Ví dụ 0901234567 hoặc +84901234567"
        />
        <PasswordField
          id="password"
          label="Mật khẩu"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          readOnly={submitting}
          hint={PASSWORD_HINT}
          required
        />
        <PasswordField
          id="confirmPassword"
          label="Nhập lại mật khẩu"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirmPassword}
          readOnly={submitting}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-coffee-800">
        Đã có tài khoản?{" "}
        <Link href={loginHref} className={authLinkClass}>
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
