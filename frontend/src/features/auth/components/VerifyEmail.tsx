"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "../AuthProvider";
import { resendVerification, verifyEmail } from "../api";
import { mapAuthError } from "../errors";
import { AuthCard } from "./AuthCard";
import { FormError, FormNotice } from "./FormError";

type VerifyState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string; tokenInvalid: boolean };

export function VerifyEmail() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  const { status, user, setUser } = useAuth();

  const [state, setState] = useState<VerifyState>({ kind: "loading" });
  const started = useRef(false);

  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const resendLock = useRef(false);

  // Chỉ gọi verify đúng 1 lần dù StrictMode chạy effect 2 lần (token chỉ dùng được 1 lần).
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(() => setState({ kind: "success" }))
      .catch((err) => {
        const tokenInvalid = err instanceof ApiError && err.code === "TOKEN_INVALID";
        setState({
          kind: "error",
          tokenInvalid,
          message: tokenInvalid
            ? "Liên kết xác thực không hợp lệ, đã hết hạn hoặc đã được sử dụng."
            : (mapAuthError(err).formError ?? "Không thể xác thực email. Vui lòng thử lại."),
        });
      });
  }, [token]);

  // Đang đăng nhập và xác thực xong -> cập nhật cờ trong state người dùng.
  const successUser = state.kind === "success" ? user : null;
  useEffect(() => {
    if (successUser && !successUser.emailVerified) setUser({ ...successUser, emailVerified: true });
  }, [successUser, setUser]);

  async function onResend() {
    if (resendLock.current) return;
    resendLock.current = true;
    setResendBusy(true);
    setResendMsg(null);
    try {
      await resendVerification();
      setResendMsg({ ok: true, text: "Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư." });
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setResendMsg({ ok: false, text: "Email của bạn đã được xác thực rồi." });
        if (user) setUser({ ...user, emailVerified: true });
      } else if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        const sec = Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec);
        setResendMsg({
          ok: false,
          text:
            Number.isFinite(sec) && sec > 0
              ? `Bạn vừa yêu cầu gửi lại. Thử lại sau ${Math.ceil(sec)} giây.`
              : "Bạn vừa yêu cầu gửi lại. Vui lòng thử lại sau ít phút.",
        });
      } else {
        setResendMsg({
          ok: false,
          text: mapAuthError(err).formError ?? "Không thể gửi lại email.",
        });
      }
    } finally {
      resendLock.current = false;
      setResendBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Xác thực email">
        <FormError>Liên kết xác thực thiếu mã xác thực. Hãy mở lại liên kết trong email.</FormError>
      </AuthCard>
    );
  }

  if (state.kind === "loading") {
    return (
      <AuthCard title="Xác thực email">
        <div className="flex items-center gap-3 text-coffee-800" role="status">
          <Spinner label="" />
          <span>Đang xác thực email của bạn...</span>
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "success") {
    return (
      <AuthCard title="Xác thực email">
        <div className="space-y-4">
          <FormNotice>Email của bạn đã được xác thực. Cảm ơn bạn!</FormNotice>
          <ButtonLink
            href={status === "authenticated" ? "/tai-khoan" : "/dang-nhap"}
            size="lg"
            className="w-full"
          >
            {status === "authenticated" ? "Đến tài khoản" : "Đăng nhập"}
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  const canResend = status === "authenticated" && user && !user.emailVerified;
  return (
    <AuthCard title="Xác thực email">
      <div className="space-y-4">
        <FormError>{state.message}</FormError>
        {canResend ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              loading={resendBusy}
              onClick={onResend}
            >
              Gửi lại email xác thực
            </Button>
            {resendMsg ? (
              resendMsg.ok ? (
                <FormNotice>{resendMsg.text}</FormNotice>
              ) : (
                <FormError>{resendMsg.text}</FormError>
              )
            ) : null}
          </>
        ) : status === "anonymous" ? (
          <ButtonLink href="/dang-nhap" variant="outline" size="lg" className="w-full">
            Đăng nhập để gửi lại email xác thực
          </ButtonLink>
        ) : null}
      </div>
    </AuthCard>
  );
}
