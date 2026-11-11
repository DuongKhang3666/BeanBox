import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { OrderSuccess } from "@/features/orders/components/OrderSuccess";

export const metadata: Metadata = {
  title: "Đặt hàng thành công",
  robots: { index: false },
};

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ pay?: string }>;
}) {
  const { code } = await params;
  const { pay } = await searchParams;
  let decoded = code;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    /* giữ nguyên: mã sai định dạng sẽ cho 404 ở bước tải */
  }
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-3xl">
        <OrderSuccess code={decoded} paymentNotice={pay === "failed"} />
      </div>
    </Container>
  );
}
