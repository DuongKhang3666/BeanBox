import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { MockGatewayView } from "@/features/payments/components/MockGatewayView";

export const metadata: Metadata = {
  title: "Cổng thanh toán giả lập",
  robots: { index: false, follow: false },
};

export default function MockGatewayPage() {
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-xl">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <MockGatewayView provider="vnpay" />
        </Suspense>
      </div>
    </Container>
  );
}
