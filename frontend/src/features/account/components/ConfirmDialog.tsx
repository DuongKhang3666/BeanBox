"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";

/** Hộp xác nhận: focus vào nút Hủy, Esc đóng, Tab xoay vòng trong hộp, trả focus khi đóng. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelCb = useRef(onCancel);
  const busyRef = useRef(busy);
  useEffect(() => {
    cancelCb.current = onCancel;
    busyRef.current = busy;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        cancelCb.current();
      } else if (e.key === "Tab" && boxRef.current) {
        const items = Array.from(
          boxRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"),
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
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-coffee-800">
          {description}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button data-autofocus variant="outline" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
