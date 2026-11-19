import type { Metadata } from "next";
import { AdminSettings } from "@/features/admin/components/AdminSettings";

export const metadata: Metadata = { title: "Cài đặt cửa hàng" };

export default function Page() {
  return <AdminSettings />;
}
