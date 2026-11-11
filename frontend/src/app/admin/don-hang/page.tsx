import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminOrders } from "@/features/admin/components/AdminOrders";

export const metadata: Metadata = { title: "Đơn hàng" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminOrders />
    </Suspense>
  );
}
