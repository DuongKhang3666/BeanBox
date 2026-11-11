import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { DemoNotice } from "@/features/content/components/DemoNotice";
import { CONTACT_EMAIL } from "@/features/content/policies";

export const metadata: Metadata = {
  title: "Liên hệ",
  description: "Cách liên hệ BeanBox và tra cứu tình trạng đơn hàng.",
  alternates: { canonical: "/lien-he" },
};

const linkClass = "font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600";

export default function ContactPage() {
  return (
    <Container className="py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="font-serif text-3xl font-bold text-coffee-900">Liên hệ</h1>
        <DemoNotice />
        <section aria-labelledby="contact-email" className="space-y-2">
          <h2 id="contact-email" className="font-serif text-xl font-bold text-coffee-900">
            Email
          </h2>
          <p className="text-coffee-800">
            Mọi câu hỏi về sản phẩm, đơn hàng hoặc dữ liệu cá nhân, vui lòng gửi tới{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
              {CONTACT_EMAIL}
            </a>
            . Nếu hỏi về một đơn hàng, hãy kèm theo mã đơn.
          </p>
        </section>
        <section aria-labelledby="contact-track" className="space-y-2">
          <h2 id="contact-track" className="font-serif text-xl font-bold text-coffee-900">
            Tra cứu đơn hàng
          </h2>
          <p className="text-coffee-800">
            Bạn có thể xem tình trạng đơn tại trang{" "}
            <Link href="/tra-cuu-don-hang" className={linkClass}>
              Tra cứu đơn hàng
            </Link>{" "}
            bằng mã đơn và số điện thoại đã dùng khi đặt.
          </p>
        </section>
        <p className="text-sm text-coffee-700">Biểu mẫu liên hệ trực tuyến sẽ có sau.</p>
      </div>
    </Container>
  );
}
