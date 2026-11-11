import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { DemoNotice } from "@/features/content/components/DemoNotice";

export const metadata: Metadata = {
  title: "Giới thiệu",
  description: "BeanBox là cửa hàng trực tuyến mẫu về hạt cà phê, dụng cụ pha chế và phụ kiện.",
  alternates: { canonical: "/gioi-thieu" },
};

const linkClass = "font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600";

export default function AboutPage() {
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="font-serif text-3xl font-bold text-coffee-900">Giới thiệu BeanBox</h1>
        <DemoNotice />
        <div className="space-y-3 leading-relaxed text-coffee-800">
          <p>
            BeanBox là cửa hàng trực tuyến về cà phê: hạt cà phê rang, dụng cụ pha chế, phụ kiện và
            các bộ quà tặng dành cho người yêu cà phê tại Việt Nam.
          </p>
          <p>
            Mỗi sản phẩm đều có mô tả rõ ràng, giá hiển thị bằng VND đã gồm VAT, và bạn có thể theo
            dõi đơn hàng bằng mã đơn mà không cần tạo tài khoản.
          </p>
        </div>
        <p>
          <Link href="/lien-he" className={linkClass}>
            Liên hệ với BeanBox
          </Link>
        </p>
      </div>
    </Container>
  );
}
