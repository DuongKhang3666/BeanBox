import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { OrderHistory } from "@/features/orders/components/OrderHistory";

export const metadata: Metadata = {
  title: "Đơn hàng của tôi",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <OrderHistory />
    </Suspense>
  );
}
