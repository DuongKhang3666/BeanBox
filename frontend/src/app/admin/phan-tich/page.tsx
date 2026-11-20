import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminAnalytics } from "@/features/admin/components/AdminAnalytics";

export const metadata: Metadata = { title: "Phân tích kinh doanh" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminAnalytics />
    </Suspense>
  );
}
