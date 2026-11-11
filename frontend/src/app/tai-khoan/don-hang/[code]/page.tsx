import type { Metadata } from "next";
import { AccountOrderDetail } from "@/features/orders/components/AccountOrderDetail";

export const metadata: Metadata = {
  title: "Chi tiết đơn hàng",
  robots: { index: false },
};

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    /* giữ nguyên: mã sai định dạng sẽ nhận 404 từ server */
  }
  return <AccountOrderDetail code={decoded} />;
}
