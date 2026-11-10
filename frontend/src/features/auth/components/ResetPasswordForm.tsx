"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { resetPassword } from "../api";
import { mapAuthError } from "../errors";
import { PASSWORD_HINT, validatePassword, validatePasswordConfirm } from "../validation";
import { ApiError } from "@/lib/api/errors";
import { AuthCard, authLinkClass } from "./AuthCard";
import { PasswordField } from "./Fields";
import { FormError, FormNotice } from "./FormError";
import { focusFirstInvalid } from "./focus";

const FIELDS = ["newPassword", "confirmPassword"] as const;

export function ResetPasswordForm() {
  const token = useSearchParams().get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  if (!token || tokenInvalid) {
    return (
      <AuthCard title="Không thể đặt lại mật khẩu">
        <div className="space-y-4">
          <FormError>
            {tokenInvalid
              ? "Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được sử dụng."
              : "Liên kết đặt lại mật khẩu thiếu mã xác thực."}
          </FormError>
          <ButtonLink href="/quen-mat-khau" size="lg" className="w-full">
            Xin liên kết mới
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <div className="space-y-4">
          <FormNotice>{done}</FormNotice>
          <ButtonLink href="/dang-nhap" size="lg" className="w-full">
            Đăng nhập
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;

    const fe: Record<string, string> = {};
    const pwErr = validatePassword(password);
    const cfErr = validatePasswordConfirm(password, confirm);
    if (pwErr) fe.newPassword = pwErr;
    if (cfErr) fe.confirmPassword = cfErr;
    setErrors(fe);
    setFormError(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      const res = await resetPassword(token, password);
      setDone(res.message || "Đã đặt lại mật khẩu.");
      return;
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_INVALID") {
        setTokenInvalid(true);
        return;
      }
      const mapped = mapAuthError(err, FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      focusFirstInvalid(FIELDS, mapped.fieldErrors);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Đặt lại mật khẩu" description="Nhập mật khẩu mới cho tài khoản của bạn.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <FormError>{formError}</FormError>
        <PasswordField
          id="newPassword"
          label="Mật khẩu mới"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.newPassword}
          readOnly={submitting}
          hint={PASSWORD_HINT}
          required
        />
        <PasswordField
          id="confirmPassword"
          label="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirmPassword}
          readOnly={submitting}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Đang lưu..." : "Đặt lại mật khẩu"}
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
