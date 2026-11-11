"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)";

/**
 * Hộp thoại dùng chung cho form admin: role="dialog", có tiêu đề, focus trap,
 * Esc đóng (trừ khi busy), trả focus về nút mở khi đóng. Phần tử có data-autofocus nhận focus đầu.
 */
export function AdminModal({
  title,
  description,
  busy,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    (
      box?.querySelector<HTMLElement>("[data-autofocus]") ??
      box?.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && box) {
        const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
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
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-coffee-800">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
