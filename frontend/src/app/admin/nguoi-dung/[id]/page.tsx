import type { Metadata } from "next";
import { AdminUserDetail } from "@/features/admin/components/AdminUserDetail";

export const metadata: Metadata = { title: "Chi tiết người dùng" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* giữ nguyên: id sai định dạng sẽ nhận 404 từ server */
  }
  return <AdminUserDetail id={decoded} />;
}
