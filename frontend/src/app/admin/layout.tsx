import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AdminGuard } from "@/features/admin/components/AdminGuard";

export const metadata: Metadata = {
  title: { default: "Quản trị", template: "%s | Quản trị BeanBox" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-6 sm:py-10">
      <AdminGuard>{children}</AdminGuard>
    </Container>
  );
}
