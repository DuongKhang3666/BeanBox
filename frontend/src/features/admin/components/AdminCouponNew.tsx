"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import { listAdminCategories } from "../api/catalog";
import { COUPONS_BASE } from "../couponFilters";
import { adminErrorMessage } from "../errors";
import { CouponForm } from "./CouponForm";

const load = () => listAdminCategories();
const NO_NAMES = {};

export function AdminCouponNew() {
  const router = useRouter();
  const res = useResource("coupon-form-categories", load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = (
      <div aria-busy="true" aria-label="Đang tải biểu mẫu" role="status" className="space-y-3">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được danh mục"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    body = (
      <CouponForm
        categories={res.data!}
        productNames={NO_NAMES}
        onSaved={(saved) => router.push(`${COUPONS_BASE}/${saved.id}`)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={COUPONS_BASE} className="text-sm text-moss-800 underline">
          ← Danh sách mã giảm giá
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-coffee-900">Thêm mã giảm giá</h1>
      </div>
      {body}
    </div>
  );
}
