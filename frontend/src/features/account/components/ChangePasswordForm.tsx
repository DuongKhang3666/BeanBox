"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { changePassword } from "@/features/auth/api";
import { mapAuthError } from "@/features/auth/errors";
import { PasswordField } from "@/features/auth/components/Fields";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import {
  PASSWORD_HINT,
  validatePassword,
  validatePasswordConfirm,
  validateRequiredPassword,
} from "@/features/auth/validation";
import { ApiError } from "@/lib/api/errors";
import { Section } from "./Section";

const FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;

    const fe: Record<string, string> = {};
    const curErr = validateRequiredPassword(current);
    let newErr = validatePassword(next);
    if (!newErr && next === current) newErr = "Mật khẩu mới phải khác mật khẩu hiện tại";
    const confErr = validatePasswordConfirm(next, confirm);
    if (curErr) fe.currentPassword = curErr;
    if (newErr) fe.newPassword = newErr;
    if (confErr) fe.confirmPassword = confErr;
    setErrors(fe);
    setFormError(undefined);
    setNotice(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_PASSWORD") {
        const fe2 = { currentPassword: "Mật khẩu hiện tại không đúng" };
        setErrors(fe2);
        focusFirstInvalid(FIELDS, fe2);
      } else {
        const mapped = mapAuthError(err, ["currentPassword", "newPassword"]);
        setErrors(mapped.fieldErrors);
        setFormError(mapped.formError);
        focusFirstInvalid(FIELDS, mapped.fieldErrors);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Section title="Đổi mật khẩu" headingId="account-password">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={saving}>
        <FormError>{formError}</FormError>
        <FormNotice>{notice}</FormNotice>
        <PasswordField
          id="currentPassword"
          label="Mật khẩu hiện tại"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.currentPassword}
          readOnly={saving}
          required
        />
        <PasswordField
          id="newPassword"
          label="Mật khẩu mới"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.newPassword}
          hint={PASSWORD_HINT}
          readOnly={saving}
          required
        />
        <PasswordField
          id="confirmPassword"
          label="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirmPassword}
          readOnly={saving}
          required
        />
        <Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto">
          {saving ? "Đang đổi..." : "Đổi mật khẩu"}
        </Button>
      </form>
    </Section>
  );
}
