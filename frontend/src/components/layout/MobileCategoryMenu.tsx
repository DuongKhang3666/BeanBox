"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MAIN_NAV } from "@/lib/site";

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Menu danh mục cho mobile (< md, D-059): nút bật/tắt + bảng thả xuống ngay dưới header.
 * Escape đóng và trả focus về nút; bấm ra ngoài hoặc chọn link thì đóng.
 * Bảng định vị theo `<header>` (sticky) nên component này KHÔNG được có `relative`.
 */
export function MobileCategoryMenu({ className }: { className?: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-coffee-800 hover:bg-coffee-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
      >
        <MenuIcon />
        <span className="sr-only min-[430px]:not-sr-only">Danh mục</span>
      </button>
      <nav
        ref={panelRef}
        id={panelId}
        aria-label="Danh mục sản phẩm"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-coffee-200 bg-cream-50 shadow-lg"
      >
        <ul className="mx-auto max-w-6xl px-2 py-1 sm:px-4">
          {MAIN_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-coffee-800 hover:bg-coffee-100"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
