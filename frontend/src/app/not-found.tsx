import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="font-serif text-6xl font-bold text-coffee-700">404</p>
      <h1 className="font-serif text-2xl font-semibold text-coffee-900">
        Rất tiếc, chúng tôi không tìm thấy trang này
      </h1>
      <p className="max-w-md text-coffee-700">
        Có thể đường dẫn đã thay đổi hoặc sản phẩm không còn được bán. Bạn thử quay lại trang chủ
        nhé.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Về trang chủ</ButtonLink>
        <ButtonLink href="/tim-kiem" variant="outline">
          Tìm sản phẩm
        </ButtonLink>
      </div>
    </Container>
  );
}
