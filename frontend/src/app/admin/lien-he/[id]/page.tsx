import type { Metadata } from "next";
import { AdminContactDetail } from "@/features/admin/components/AdminContactDetail";

export const metadata: Metadata = { title: "Chi tiết liên hệ" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* giữ nguyên: id sai định dạng sẽ nhận 404 từ server */
  }
  return <AdminContactDetail id={decoded} />;
}
