import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CartView } from "@/features/cart/components/CartView";

export const metadata: Metadata = {
  title: "Giỏ hàng",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <Container className="py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-coffee-900">Giỏ hàng</h1>
      <CartView />
    </Container>
  );
}
