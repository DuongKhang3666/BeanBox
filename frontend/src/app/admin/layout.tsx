import type { Metadata } from "next";
import { connection } from "next/server";
import { Container } from "@/components/ui/Container";
import { AdminGuard } from "@/features/admin/components/AdminGuard";

export const metadata: Metadata = {
  title: { default: "Quản trị", template: "%s | Quản trị BeanBox" },
  robots: { index: false, follow: false },
};

// Ép render động theo request để Next gắn nonce (CSP admin, src/proxy.ts).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <Container className="py-6 sm:py-10">
      <AdminGuard>{children}</AdminGuard>
    </Container>
  );
}
