import type { Metadata } from "next";
import { AdminBrands } from "@/features/admin/components/AdminBrands";

export const metadata: Metadata = { title: "Thương hiệu" };

export default function Page() {
  return <AdminBrands />;
}
