import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminProducts } from "@/features/admin/components/AdminProducts";

export const metadata: Metadata = { title: "Sản phẩm" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminProducts />
    </Suspense>
  );
}
