import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ContactForm } from "@/features/content/components/ContactForm";
import { DemoNotice } from "@/features/content/components/DemoNotice";
import { getPublicSettings } from "@/features/content/publicSettings";

export const metadata: Metadata = {
  title: "Liên hệ",
  description: "Cách liên hệ BeanBox và tra cứu tình trạng đơn hàng.",
  alternates: { canonical: "/lien-he" },
};

/** ISR: thông tin liên hệ cập nhật trong khoảng 5 phút. */
export const revalidate = 300;

const linkClass = "font-medium text-moss-700 underline underline-offset-2 hover:text-moss-600";

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const { contact } = settings.store;
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
            <a href={`mailto:${contact.email}`} className={linkClass}>
              {contact.email}
            </a>
            . Nếu hỏi về một đơn hàng, hãy kèm theo mã đơn.
          </p>
        </section>
        {contact.phone ? (
          <section aria-labelledby="contact-phone" className="space-y-2">
            <h2 id="contact-phone" className="font-serif text-xl font-bold text-coffee-900">
              Điện thoại
            </h2>
            <p className="text-coffee-800">
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                {contact.phone}
              </a>
            </p>
          </section>
        ) : null}
        {contact.address ? (
          <section aria-labelledby="contact-address" className="space-y-2">
            <h2 id="contact-address" className="font-serif text-xl font-bold text-coffee-900">
              Địa chỉ
            </h2>
            <p className="text-coffee-800">{contact.address}</p>
          </section>
        ) : null}
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
        <section aria-labelledby="contact-form" className="space-y-3">
          <h2 id="contact-form" className="font-serif text-xl font-bold text-coffee-900">
            Gửi tin nhắn cho BeanBox
          </h2>
          <ContactForm captcha={settings.contactCaptcha} storeEmail={contact.email} />
        </section>
      </div>
    </Container>
  );
}
