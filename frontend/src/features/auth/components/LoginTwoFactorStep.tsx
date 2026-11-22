"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";
import type { TwoFactorChallenge } from "@/types/auth";
import { useAuth } from "../AuthProvider";
import { mapAuthError } from "../errors";
import { formatCountdown, normalizeTotp, validateBackup, validateTotp } from "../twoFactorCode";
import { AuthCard, authLinkClass } from "./AuthCard";
import { TextField } from "./Fields";
import { FormError } from "./FormError";

type Mode = "totp" | "backup";

/**
 * Bước 2 của đăng nhập 2 lớp (D-063). `challengeToken` chỉ nằm trong state/props của React,
 * không bao giờ ghi vào localStorage/sessionStorage/URL.
 */
export function LoginTwoFactorStep({
  challenge,
  onSuccess,
  onRestart,
}: {
  challenge: TwoFactorChallenge;
  onSuccess: () => void;
  onRestart: () => void;
}) {
  const { loginTwoFactor } = useAuth();
  const [mode, setMode] = useState<Mode>("totp");
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [dead, setDead] = useState(false); // thử thách hết hạn/bị vô hiệu: phải đăng nhập lại
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const expiresAtMs = new Date(challenge.expiresAt).getTime();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtMs]);

  const expired = dead || remaining <= 0;

  // Vào bước 2 và mỗi lần đổi kiểu mã: đưa focus vào ô mã.
  useEffect(() => {
    if (!expired) inputRef.current?.focus();
  }, [mode, expired]);

  function switchMode(next: Mode) {
    setMode(next);
    setValue("");
    setFieldError(undefined);
    setFormError(undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || expired) return;

    const err = mode === "totp" ? validateTotp(value) : validateBackup(value);
    setFieldError(err);
    setFormError(undefined);
    if (err) {
      inputRef.current?.focus();
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      await loginTwoFactor(
        mode === "totp"
          ? { challengeToken: challenge.challengeToken, code: normalizeTotp(value) }
          : { challengeToken: challenge.challengeToken, backupCode: value.trim() },
      );
      onSuccess();
    } catch (e2) {
      const mapped = mapAuthError(e2);
      setFormError(mapped.formError);
      if (e2 instanceof ApiError && e2.code === "TWO_FACTOR_CHALLENGE_INVALID") {
        setDead(true);
      } else {
        setValue("");
        inputRef.current?.focus();
      }
      busy.current = false;
      setSubmitting(false);
    }
  }

  if (expired) {
    return (
      <AuthCard title="Phiên xác thực đã hết hạn">
        <div className="space-y-4">
          <FormError>{formError ?? "Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại."}</FormError>
          <Button type="button" size="lg" className="w-full" onClick={onRestart}>
            Đăng nhập lại
          </Button>
        </div>
      </AuthCard>
    );
  }

  const isTotpMode = mode === "totp";
  return (
    <AuthCard
      title="Xác thực 2 lớp"
      description={
        isTotpMode
          ? "Nhập mã 6 số từ ứng dụng xác thực (Google Authenticator, Microsoft Authenticator, ...)."
          : "Nhập một mã dự phòng bạn đã lưu khi bật xác thực 2 lớp. Mỗi mã chỉ dùng được một lần."
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={submitting}>
        <FormError>{formError}</FormError>
        <TextField
          id="twoFactorCode"
          label={isTotpMode ? "Mã xác thực" : "Mã dự phòng"}
          type="text"
          inputMode={isTotpMode ? "numeric" : "text"}
          autoComplete={isTotpMode ? "one-time-code" : "off"}
          autoCapitalize={isTotpMode ? "off" : "characters"}
          spellCheck={false}
          maxLength={isTotpMode ? 7 : 16}
          placeholder={isTotpMode ? "123456" : "ABCDE-FGHJK"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={fieldError}
          readOnly={submitting}
          required
          ref={inputRef}
        />
        <p className="text-sm text-coffee-700">
          Phiên xác thực hết hạn sau{" "}
          <span className="font-medium">{formatCountdown(remaining)}</span>.
        </p>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? "Đang xác thực..." : "Xác nhận"}
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm text-coffee-800">
        <p>
          <button
            type="button"
            className={authLinkClass}
            onClick={() => switchMode(isTotpMode ? "backup" : "totp")}
          >
            {isTotpMode ? "Dùng mã dự phòng" : "Dùng mã từ ứng dụng xác thực"}
          </button>
        </p>
        <p>
          <button type="button" className={authLinkClass} onClick={onRestart}>
            Quay lại đăng nhập
          </button>
        </p>
      </div>
    </AuthCard>
  );
}
