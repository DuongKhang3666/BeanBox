import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AccountGuard } from "@/features/account/components/AccountGuard";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-6 sm:py-10">
      <AccountGuard>{children}</AccountGuard>
    </Container>
  );
}
