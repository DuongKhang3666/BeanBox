"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
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
 * loading -> skeleton; anonymous -> /dang-nhap?next=...; CUSTOMER -> thông báo; STAFF/ADMIN -> nội dung.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { status, user, logoutReason } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 print:block">
      <AdminNav />
      <div className="mt-6 min-w-0 md:mt-0">{children}</div>
    </div>
  );
}
