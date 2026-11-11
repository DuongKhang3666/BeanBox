import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CheckoutView } from "@/features/checkout/components/CheckoutView";

export const metadata: Metadata = {
  title: "Thanh toán",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <Container className="py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-coffee-900">Thanh toán</h1>
      <CheckoutView />
    </Container>
  );
}
