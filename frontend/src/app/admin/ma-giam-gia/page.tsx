import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminCoupons } from "@/features/admin/components/AdminCoupons";

export const metadata: Metadata = { title: "Mã giảm giá" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminCoupons />
    </Suspense>
  );
}
