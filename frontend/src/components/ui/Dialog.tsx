"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Hộp thoại modal dùng chung (D-074): `<dialog>` native + `showModal()`.
 * Trình duyệt lo focus trap, vô hiệu hóa (inert) phần nền và lớp "top layer"; component lo phần còn lại:
 * tiêu đề (`aria-labelledby`), mô tả (`aria-describedby`), Escape (chặn khi `busy`), focus đầu tiên,
 * trả focus về phần tử đã kích hoạt, khóa cuộn nền.
 *
 * Mô hình dùng: render có điều kiện (`{open ? <Dialog .../> : null}`); mount = mở, unmount = đóng.
 * Focus đầu: phần tử có `data-autofocus`; nếu không có thì phần tử tương tác đầu tiên (`initialFocus="first"`)
 * hoặc chính hộp (`initialFocus="container"`).
 */

export type DialogSize = "sm" | "md" | "wide";

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  wide: "max-w-3xl",
};

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Ngăn xếp hộp thoại đang mở: chỉ hộp trên cùng xử lý Escape; khóa cuộn nền theo bộ đếm.
const stack: symbol[] = [];
let lockCount = 0;
let prevOverflow = "";

function lockScroll() {
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = prevOverflow;
}

export interface DialogProps {
  /** Tiêu đề (h2, gắn `aria-labelledby`). Bỏ qua nếu tự render tiêu đề và truyền `labelledBy`. */
  title?: React.ReactNode;
  /** Id của tiêu đề do bên gọi tự render (dạng ngăn kéo). */
  labelledBy?: string;
  /** Mô tả ngắn (gắn `aria-describedby`). Chuỗi -> `<p>`; node -> `<div>`. */
  description?: React.ReactNode;
  descriptionClassName?: string;
  size?: DialogSize;
  /** `center`: hộp giữa màn hình (bottom sheet trên mobile). `drawer`: ngăn kéo phủ toàn màn hình, nội dung tự bố cục. */
  variant?: "center" | "drawer";
  /** Đang gửi: chặn Escape. */
  busy?: boolean;
  /** Gọi khi người dùng yêu cầu đóng (Escape, click nền nếu bật). */
  onClose: () => void;
  /** Có nhãn thì render nút đóng "×" ở góc hộp (variant center). */
  closeLabel?: string;
  /** Click vào nền (ngoài ngăn kéo) cũng đóng. Dùng cho `drawer`. */
  closeOnBackdrop?: boolean;
  initialFocus?: "first" | "container";
  /**
   * Nơi trả focus khi đóng. Mặc định là phần tử đang focus lúc mở; truyền hàm khi phần tử đó không đáng tin
   * (ví dụ nút kích hoạt đã bị disable lúc hộp mở). Trả null/undefined -> dùng mặc định.
   */
  returnFocusTo?: () => HTMLElement | null | undefined;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}

export function Dialog({
  title,
  labelledBy,
  description,
  descriptionClassName = "mt-2 text-sm text-coffee-800",
  size = "md",
  variant = "center",
  busy,
  onClose,
  closeLabel,
  closeOnBackdrop,
  initialFocus = "first",
  returnFocusTo,
  className,
  testId,
  children,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
    returnRef.current = returnFocusTo;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const token = Symbol("dialog");
    const opener = document.activeElement as HTMLElement | null;
    let closingByUs = false;

    if (!dialog.open) dialog.showModal();
    stack.push(token);
    lockScroll();

    const target =
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      (initialFocus === "first" ? dialog.querySelector<HTMLElement>(FOCUSABLE) : null) ??
      dialog;
    target.focus();

    const requestClose = () => {
      if (!busyRef.current) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || stack[stack.length - 1] !== token) return;
      e.preventDefault();
      requestClose();
    };
    // Escape thường đã bị chặn ở keydown; `cancel` là lưới an toàn (ví dụ yêu cầu đóng từ hệ điều hành).
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (stack[stack.length - 1] === token) requestClose();
    };
    // Trình duyệt có thể đóng thẳng (Escape lần 2 liên tiếp khi cancel bị chặn): mở lại nếu đang bận, ngược lại báo đóng.
    const onNativeClose = () => {
      // Sự kiện `close` là bất đồng bộ: sự kiện của lần đóng do cleanup (StrictMode mount lại) có thể
      // đến sau khi hộp đã mở lại, khi đó `open` đang true và phải bỏ qua.
      if (closingByUs || dialog.open) return;
      if (busyRef.current) {
        if (dialog.isConnected && !dialog.open) dialog.showModal();
      } else {
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);

    return () => {
      closingByUs = true;
      document.removeEventListener("keydown", onKey);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      if (dialog.open) dialog.close();
      const preferred = returnRef.current?.();
      if (preferred?.isConnected) preferred.focus();
      else if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus]);

  const drawer = variant === "drawer";
  const hasTitle = title !== undefined && title !== null;
  const labelId = hasTitle ? titleId : labelledBy;

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      data-testid={testId}
      onClick={
        closeOnBackdrop
          ? (e) => {
              if (e.target === e.currentTarget) requestCloseFrom(closeRef, busyRef);
            }
          : undefined
      }
      className={cn(
        "fixed inset-0 text-inherit outline-none backdrop:bg-coffee-900/50",
        drawer
          ? "m-0 h-full max-h-none w-full max-w-none justify-end bg-transparent p-0 open:flex"
          : cn(
              "mx-auto mt-auto mb-4 max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:my-auto",
              SIZE_CLASS[size],
            ),
        className,
      )}
    >
      {hasTitle ? (
        <div className={closeLabel ? "flex items-start justify-between gap-3" : undefined}>
          <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
            {title}
          </h2>
          {closeLabel ? (
            <button
              type="button"
              onClick={() => requestCloseFrom(closeRef, busyRef)}
              aria-label={closeLabel}
              className="-mt-1 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-coffee-800 hover:bg-coffee-100"
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {description ? (
        typeof description === "string" ? (
          <p id={descId} className={descriptionClassName}>
            {description}
          </p>
        ) : (
          <div id={descId} className={descriptionClassName}>
            {description}
          </div>
        )
      ) : null}
      {children}
    </dialog>
  );
}

function requestCloseFrom(
  closeRef: React.RefObject<() => void>,
  busyRef: React.RefObject<boolean | undefined>,
) {
  if (!busyRef.current) closeRef.current();
}
