"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DELETE_ACCOUNT_PHRASE, deleteAccount } from "@/features/auth/api";
import { PasswordField, TextField } from "@/features/auth/components/Fields";
import { FormError } from "@/features/auth/components/FormError";
import { mapAuthError } from "@/features/auth/errors";
import { ApiError } from "@/lib/api/errors";

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), a[href]";

function activeOrderCodes(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.code !== "ACTIVE_ORDERS_EXIST") return null;
  const d = err.details;
  const codes =
    d && typeof d === "object" && !Array.isArray(d)
      ? (d as { orderCodes?: unknown }).orderCodes
      : undefined;
  return Array.isArray(codes) ? codes.filter((c): c is string => typeof c === "string") : [];
}

/**
 * Hộp thoại xóa tài khoản (D-065): nêu hậu quả, cần mật khẩu + gõ đúng cụm xác nhận mới bật nút.
 * Focus vào ô mật khẩu, Esc đóng (trừ lúc đang gửi), Tab xoay vòng trong hộp, trả focus khi đóng.
 */
export function DeleteAccountDialog({
  onDeleted,
  onCancel,
}: {
  /** Gọi sau khi server trả 204 (nơi gọi dọn phiên local và điều hướng). */
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [orderCodes, setOrderCodes] = useState<string[] | null>(null);
  const busyRef = useRef(false);
  const cancelCb = useRef(onCancel);
  useEffect(() => {
    cancelCb.current = onCancel;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        cancelCb.current();
      } else if (e.key === "Tab" && boxRef.current) {
        const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const canSubmit = password.length > 0 && phrase === DELETE_ACCOUNT_PHRASE && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFormError(undefined);
    setPasswordError(undefined);
    setOrderCodes(null);
    try {
      await deleteAccount(password, phrase);
      onDeleted();
      return;
    } catch (err) {
      const codes = activeOrderCodes(err);
      if (codes) {
        setOrderCodes(codes);
      } else if (err instanceof ApiError && err.code === "INVALID_PASSWORD") {
        setPasswordError("Mật khẩu không đúng");
      } else {
        setFormError(mapAuthError(err, ["password", "confirmText"]).formError);
      }
    }
    busyRef.current = false;
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-coffee-900/50 p-4 sm:items-center">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
          Xóa tài khoản
        </h2>
        <div id={descId} className="mt-2 space-y-2 text-sm text-coffee-800">
          <p>Thao tác này không thể hoàn tác. Khi xóa tài khoản:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Bạn bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập lại; email này có thể dùng
              để đăng ký tài khoản mới.
            </li>
            <li>Sổ địa chỉ, giỏ hàng và danh sách yêu thích bị xóa.</li>
            <li>
              Đơn hàng cũ vẫn được lưu để đối soát nhưng tên, số điện thoại, email và địa chỉ chi
              tiết trên đơn bị ẩn.
            </li>
            <li>Đánh giá của bạn vẫn hiển thị với tên &quot;Người dùng đã xóa&quot;.</li>
          </ul>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4" aria-busy={busy}>
          <FormError>{formError}</FormError>
          {orderCodes ? (
            <div
              role="alert"
              className="rounded-xl border border-danger-600 bg-danger-50 p-3 text-sm text-danger-600"
            >
              <p>
                Bạn còn đơn hàng đang xử lý nên chưa thể xóa tài khoản. Hãy chờ đơn hoàn tất hoặc
                hủy đơn trước:
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {orderCodes.map((code) => (
                  <li key={code}>
                    <Link
                      href={`/tai-khoan/don-hang/${encodeURIComponent(code)}`}
                      className="font-medium underline"
                    >
                      {code}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <PasswordField
            id="deletePassword"
            label="Mật khẩu hiện tại"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            readOnly={busy}
            required
          />
          <TextField
            id="deleteConfirmText"
            label={`Gõ ${DELETE_ACCOUNT_PHRASE} để xác nhận`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            readOnly={busy}
            required
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!canSubmit}>
              Xóa tài khoản vĩnh viễn
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
