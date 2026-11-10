"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { AccountNav } from "./AccountNav";
import { AccountSkeleton } from "./AccountSkeleton";

/** Chặn khu tài khoản: loading -> skeleton, anonymous -> /dang-nhap?next=..., authenticated -> nội dung. */
export function AccountGuard({ children }: { children: React.ReactNode }) {
  const { status, logoutReason, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const leaving = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // Tự đăng xuất (logoutReason === "user") thì nơi gọi tự điều hướng; chỉ hết phiên mới sang đăng nhập.
    if (status === "anonymous" && logoutReason !== "user") {
      router.replace(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, logoutReason, pathname, router]);

  async function onLogout() {
    if (leaving.current) return;
    leaving.current = true;
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } catch {
      leaving.current = false;
      setLoggingOut(false);
    }
  }

  if (status !== "authenticated") return <AccountSkeleton />;

  return (
    <div className="md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <AccountNav onLogout={onLogout} loggingOut={loggingOut} />
      <div className="mt-6 min-w-0 md:mt-0">{children}</div>
    </div>
  );
}
