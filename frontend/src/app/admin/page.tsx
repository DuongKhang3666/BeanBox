import type { Metadata } from "next";
import { AdminDashboard } from "@/features/admin/components/AdminDashboard";

export const metadata: Metadata = { title: "Tổng quan" };

export default function Page() {
  return <AdminDashboard />;
}
