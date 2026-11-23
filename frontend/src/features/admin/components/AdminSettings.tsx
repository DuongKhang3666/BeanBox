"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import { getAdminSettings, type AdminSettingsResult } from "../api/settings";
import { adminErrorMessage } from "../errors";
import { AreaSection } from "./settings/AreaSection";
import { BankSection } from "./settings/BankSection";
import { BannersSection } from "./settings/BannersSection";
import { ContactSection } from "./settings/ContactSection";
import { ShippingSection } from "./settings/ShippingSection";

const loadSettings = () => getAdminSettings();

// Từng khối cài đặt nằm ở ./settings/ (D-074); file này chỉ lo bố cục, tải dữ liệu và quyền.

function Forbidden() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
    >
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Bạn không đủ quyền xem trang cài đặt
      </h1>
      <p className="text-coffee-800">Chỉ quản trị viên mới xem được trang này.</p>
      <Link href="/admin" className={buttonClasses("primary")}>
        Về tổng quan
      </Link>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải cài đặt" role="status" className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

function SettingsForms({ initial }: { initial: AdminSettingsResult }) {
  const [result, setResult] = useState(initial);
  const onSaved = useCallback((r: AdminSettingsResult) => setResult(r), []);
  return (
    <div className="space-y-5">
      <ShippingSection result={result} onSaved={onSaved} />
      <AreaSection result={result} onSaved={onSaved} />
      <ContactSection result={result} onSaved={onSaved} />
      <BankSection result={result} onSaved={onSaved} />
      <BannersSection result={result} onSaved={onSaved} />
    </div>
  );
}

export function AdminSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  // Chỉ gọi API khi là ADMIN; STAFF thấy thông báo (backend vẫn chặn 403).
  const res = useResource<AdminSettingsResult>(isAdmin ? "settings" : null, loadSettings);

  if (user && !isAdmin) return <Forbidden />;

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <SettingsSkeleton />;
  else if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 403) return <Forbidden />;
    body = (
      <ErrorState
        title="Không tải được cài đặt"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else body = <SettingsForms initial={res.data!} />;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Cài đặt cửa hàng</h1>
        <p className="rounded-lg bg-moss-50 px-3 py-2 text-sm text-moss-800">
          Phí ship áp dụng ngay cho đơn mới; trang chính sách, chân trang và banner cập nhật trong
          vòng khoảng 5 phút.
        </p>
      </div>
      {body}
    </div>
  );
}
