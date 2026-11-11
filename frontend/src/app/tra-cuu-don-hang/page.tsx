import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrackOrder } from "@/features/orders/components/TrackOrder";

export const metadata: Metadata = {
  title: "Tra cứu đơn hàng",
  description: "Tra cứu tình trạng đơn hàng BeanBox bằng mã đơn và số điện thoại.",
  robots: { index: false },
};

export default function TrackOrderPage() {
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 font-serif text-3xl font-bold text-coffee-900">Tra cứu đơn hàng</h1>
        <p className="mb-6 text-coffee-800">
          Nhập mã đơn và số điện thoại đã dùng khi đặt hàng để xem tình trạng đơn.
        </p>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <TrackOrder />
        </Suspense>
      </div>
    </Container>
  );
}
