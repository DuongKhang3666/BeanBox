"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { resendVerification } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { mapAuthError } from "@/features/auth/errors";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import { Section } from "./Section";

export function EmailCard() {
  const { user, reloadUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const lock = useRef(false);

  if (!user) return null;

  async function onResend() {
    if (lock.current) return;
    lock.current = true;
    setSending(true);
    setNotice(undefined);
    setError(undefined);
    try {
      await resendVerification();
      setNotice("Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNotice("Email của bạn đã được xác thực.");
        try {
          await reloadUser();
        } catch {
          /* trạng thái sẽ cập nhật ở lần tải sau */
        }
      } else {
        setError(mapAuthError(e).formError);
      }
    } finally {
      lock.current = false;
      setSending(false);
    }
  }

  return (
    <Section title="Email" headingId="account-email">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="break-all text-coffee-900">{user.email}</p>
        <span
          className={
            user.emailVerified
              ? "rounded-full bg-moss-50 px-2.5 py-0.5 text-xs font-medium text-moss-800"
              : "rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-medium text-coffee-900"
          }
        >
          {user.emailVerified ? "Đã xác thực" : "Chưa xác thực"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {!user.emailVerified ? (
          <>
            <p className="text-sm text-coffee-700">
              Hãy xác thực email để nhận thông báo đơn hàng và khôi phục mật khẩu khi cần.
            </p>
            <Button variant="outline" onClick={onResend} loading={sending}>
              {sending ? "Đang gửi..." : "Gửi lại email xác thực"}
            </Button>
          </>
        ) : null}
        <FormNotice>{notice}</FormNotice>
        <FormError>{error}</FormError>
      </div>
    </Section>
  );
}
