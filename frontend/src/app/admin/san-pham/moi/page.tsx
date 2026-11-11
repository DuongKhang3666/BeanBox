import type { Metadata } from "next";
import { AdminProductNew } from "@/features/admin/components/AdminProductNew";

export const metadata: Metadata = { title: "Thêm sản phẩm" };

export default function Page() {
  return <AdminProductNew />;
}
