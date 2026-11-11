import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { PaymentResultView } from "@/features/payments/components/PaymentResultView";

export const metadata: Metadata = {
  title: "Kết quả thanh toán",
  robots: { index: false, follow: false },
};

export default function PaymentResultPage() {
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-xl">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <PaymentResultView />
        </Suspense>
      </div>
    </Container>
  );
}
