import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminContactMessages } from "@/features/admin/components/AdminContactMessages";

export const metadata: Metadata = { title: "Liên hệ" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminContactMessages />
    </Suspense>
  );
}
