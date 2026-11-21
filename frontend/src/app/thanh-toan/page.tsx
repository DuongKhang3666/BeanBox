import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CheckoutView } from "@/features/checkout/components/CheckoutView";
import { getPublicSettings } from "@/features/content/publicSettings";

export const metadata: Metadata = {
  title: "Thanh toán",
  robots: { index: false },
};

/** ISR 300 giây (theo cache của GET /settings/public) để biết cửa hàng có bật captcha không (D-057). */
export const revalidate = 300;

export default async function CheckoutPage() {
  const settings = await getPublicSettings();
  return (
    <Container className="py-8">
      <h1 className="mb-6 font-serif text-3xl font-bold text-coffee-900">Thanh toán</h1>
      <CheckoutView captcha={settings.contactCaptcha} />
    </Container>
  );
}
