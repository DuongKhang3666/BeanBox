"use client";

import { useState } from "react";
import { Input, type InputProps } from "@/components/ui/Input";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 4l16 16" strokeLinecap="round" /> : null}
    </svg>
  );
}

/** Ô mật khẩu có nút hiện/ẩn (aria-pressed). */
export function PasswordInput({ className, ...rest }: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...rest}
        type={visible ? "text" : "password"}
        className={`pr-12 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-lg text-coffee-700 hover:text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}
