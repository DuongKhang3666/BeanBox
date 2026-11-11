import type { Metadata } from "next";
import { AdminCouponEditor } from "@/features/admin/components/AdminCouponEditor";

export const metadata: Metadata = { title: "Sửa mã giảm giá" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminCouponEditor id={id} />;
}
