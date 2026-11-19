import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminUsers } from "@/features/admin/components/AdminUsers";

export const metadata: Metadata = { title: "Người dùng" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminUsers />
    </Suspense>
  );
}
