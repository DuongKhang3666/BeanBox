import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminMovements } from "@/features/admin/components/AdminMovements";

export const metadata: Metadata = { title: "Lịch sử tồn kho" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminMovements />
    </Suspense>
  );
}
