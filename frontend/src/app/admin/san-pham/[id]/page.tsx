import type { Metadata } from "next";
import { AdminProductEditor } from "@/features/admin/components/AdminProductEditor";

export const metadata: Metadata = { title: "Sửa sản phẩm" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProductEditor id={id} />;
}
