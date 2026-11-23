import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminOrdersBulkPrint } from "@/features/admin/components/AdminOrdersBulkPrint";

export const metadata: Metadata = { title: "In phiếu hàng loạt" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminOrdersBulkPrint />
    </Suspense>
  );
}
