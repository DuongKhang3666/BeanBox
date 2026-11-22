"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ADMIN_2FA_REQUIRED_EVENT } from "@/lib/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import Link from "next/link";
import { AdminNav } from "./AdminNav";

function AdminSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải" className="space-y-4" data-testid="admin-skeleton">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Chặn khu quản trị theo vai trò. Chỉ là UX: quyền thật do backend kiểm tra (401/403) ở mọi /admin/*.
 * loading -> skeleton; anonymous -> /dang-nhap?next=...; CUSTOMER -> thông báo; STAFF/ADMIN -> nội dung;
 * ADMIN bị bắt buộc 2FA mà chưa bật -> màn hình hướng dẫn bật 2FA.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { status, user, logoutReason } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // D-070: cờ REQUIRE_ADMIN_2FA có thể bật khi phiên đang mở -> request admin trả 403 ADMIN_TWO_FACTOR_REQUIRED.
  const [serverRequires2fa, setServerRequires2fa] = useState(false);

  useEffect(() => {
    const onRequired = () => setServerRequires2fa(true);
    window.addEventListener(ADMIN_2FA_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ADMIN_2FA_REQUIRED_EVENT, onRequired);
  }, []);

  useEffect(() => {
    if (status === "anonymous" && logoutReason !== "user") {
      router.replace(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, logoutReason, pathname, router]);

  if (status !== "authenticated" || !user) return <AdminSkeleton />;

  if (user.role !== "STAFF" && user.role !== "ADMIN") {
    return (
      <div
        role="alert"
        className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
      >
        <h1 className="font-serif text-xl font-bold text-coffee-900">
          Bạn không có quyền truy cập khu quản trị
        </h1>
        <p className="text-coffee-800">Khu vực này chỉ dành cho nhân viên và quản trị viên.</p>
        <Link href="/" className={buttonClasses("primary")}>
          Về trang chủ
        </Link>
      </div>
    );
  }

  // D-070: server bắt buộc 2FA cho Admin (REQUIRE_ADMIN_2FA) và tài khoản này chưa bật -> /admin/* trả 403.
  // Không chuyển hướng tự động (tránh vòng lặp): chỉ hiện hướng dẫn kèm nút tới mục 2FA ở /tai-khoan.
  if (user.twoFactorRequired || (serverRequires2fa && !user.twoFactorEnabled)) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
      >
        <h1 className="font-serif text-xl font-bold text-coffee-900">Cần bật xác thực 2 lớp</h1>
        <p className="text-coffee-800">
          Hệ thống yêu cầu tài khoản Admin bật xác thực 2 lớp trước khi dùng khu quản trị. Hãy bật ở
          mục &ldquo;Xác thực 2 lớp&rdquo; trong trang tài khoản, sau đó quay lại đây.
        </p>
        <Link href="/tai-khoan#account-2fa" className={buttonClasses("primary")}>
          Bật xác thực 2 lớp
        </Link>
      </div>
    );
  }

  return (
    <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 print:block">
      <AdminNav />
      <div className="mt-6 min-w-0 md:mt-0">{children}</div>
    </div>
  );
}
