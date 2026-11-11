import type { Metadata } from "next";
import { AdminCategories } from "@/features/admin/components/AdminCategories";

export const metadata: Metadata = { title: "Danh mục" };

export default function Page() {
  return <AdminCategories />;
}
