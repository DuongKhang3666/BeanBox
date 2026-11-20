import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { CompareLoading, CompareView } from "@/features/compare/components/CompareView";

export const metadata: Metadata = {
  title: "So sánh sản phẩm",
  robots: { index: false, follow: true },
};

export default function ComparePage() {
  return (
    <Container className="py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-coffee-900">So sánh sản phẩm</h1>
      <Suspense fallback={<CompareLoading />}>
        <CompareView />
      </Suspense>
    </Container>
  );
}
