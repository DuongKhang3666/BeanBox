import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminReviews } from "@/features/admin/components/AdminReviews";

export const metadata: Metadata = { title: "Đánh giá" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminReviews />
    </Suspense>
  );
}
