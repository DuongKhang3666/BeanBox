"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.4-3.6 4.4-5 8-5s6.6 1.4 8 5" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" strokeLinecap="round" />
      <path d="M16 8l4 4-4 4M20 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconLink =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg text-coffee-800 hover:bg-coffee-100";

/** Khu tài khoản trên Header: loading -> icon giữ chỗ; anonymous -> đăng nhập; authenticated -> tài khoản + đăng xuất. */
export function HeaderAccount() {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function onLogout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await logout();
      router.push("/");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <span className={iconLink} aria-hidden="true">
        <UserIcon />
      </span>
    );
  }

  if (status === "anonymous" || !user) {
    return (
      <Link href="/dang-nhap" className={iconLink} aria-label="Đăng nhập">
        <UserIcon />
      </Link>
    );
  }

  const isStaff = user.role === "STAFF" || user.role === "ADMIN";

  return (
    <>
      {isStaff ? (
        <Link
          href="/admin/don-hang"
          aria-label="Quản trị"
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-moss-800 hover:bg-coffee-100"
        >
          <AdminIcon />
          {/* Dưới xl chỉ hiện icon để không ép ô tìm kiếm. */}
          <span className="hidden xl:inline">Quản trị</span>
        </Link>
      ) : null}
      <Link href="/tai-khoan" className={iconLink} aria-label={`Tài khoản của ${user.fullName}`}>
        <UserIcon />
      </Link>
      <button
        type="button"
        onClick={onLogout}
        disabled={busy}
        aria-label="Đăng xuất"
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-coffee-800 hover:bg-coffee-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogoutIcon />
        <span className="hidden sm:inline lg:hidden xl:inline">Đăng xuất</span>
      </button>
    </>
  );
}
