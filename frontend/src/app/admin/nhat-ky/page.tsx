import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminAuditLog } from "@/features/admin/components/AdminAuditLog";

export const metadata: Metadata = { title: "Nhật ký thao tác" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminAuditLog />
    </Suspense>
  );
}
