"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export const CANCEL_REASON_MAX = 255;

/** Hộp hủy đơn: lý do tùy chọn (<= 255 ký tự). Focus vào ô lý do, Esc đóng, Tab xoay vòng, trả focus khi đóng. */
export function CancelOrderDialog({
  code,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  code: string;
  busy?: boolean;
  /** Lỗi từ lần hủy trước (hiển thị trong hộp). */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const areaId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const cancelCb = useRef(onCancel);
  const busyRef = useRef(busy);
  useEffect(() => {
    cancelCb.current = onCancel;
    busyRef.current = busy;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        cancelCb.current();
      } else if (e.key === "Tab" && boxRef.current) {
        const items = Array.from(
          boxRef.current.querySelectorAll<HTMLElement>("textarea, button:not(:disabled)"),
        );
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-coffee-900/50 p-4 sm:items-center">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
          Hủy đơn hàng {code}?
        </h2>
        <p id={descId} className="mt-2 text-sm text-coffee-800">
          Sau khi hủy, đơn hàng không thể khôi phục. Sản phẩm sẽ được hoàn lại kho.
        </p>
        <label htmlFor={areaId} className="mt-4 block text-sm font-medium text-coffee-900">
          Lý do hủy (không bắt buộc)
        </label>
        <textarea
          id={areaId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={CANCEL_REASON_MAX}
          rows={3}
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900"
        />
        <p className="mt-1 text-right text-xs text-coffee-700">
          {reason.length}/{CANCEL_REASON_MAX}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger-600">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Giữ đơn hàng
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())} loading={busy}>
            Xác nhận hủy đơn
          </Button>
        </div>
      </div>
    </div>
  );
}
