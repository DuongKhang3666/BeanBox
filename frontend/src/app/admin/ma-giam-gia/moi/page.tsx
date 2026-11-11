import type { Metadata } from "next";
import { AdminCouponNew } from "@/features/admin/components/AdminCouponNew";

export const metadata: Metadata = { title: "Thêm mã giảm giá" };

export default function Page() {
  return <AdminCouponNew />;
}
