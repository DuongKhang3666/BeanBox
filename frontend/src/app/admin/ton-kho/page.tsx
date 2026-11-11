import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminInventory } from "@/features/admin/components/AdminInventory";

export const metadata: Metadata = { title: "Tồn kho" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminInventory />
    </Suspense>
  );
}
