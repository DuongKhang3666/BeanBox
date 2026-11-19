import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { getPublicSettings } from "@/features/content/publicSettings";
import type { StoreContact } from "@/types/settings";
import { FOOTER_LINKS, MAIN_NAV, POLICY_LINKS } from "@/lib/site";

function LinkList({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-coffee-100">
        {title}
      </h2>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-block py-1 text-cream-200 hover:text-white hover:underline"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Server Component: lấy liên hệ từ /settings/public (ISR 300 giây, lỗi -> mặc định). */
export async function Footer() {
  const { contact } = (await getPublicSettings()).store;
  return <FooterView contact={contact} />;
}

export function FooterView({ contact }: { contact: StoreContact }) {
  return (
    <footer className="mt-16 print:hidden bg-coffee-900 text-cream-200">
      <Container className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-2xl font-bold text-cream-50">BeanBox</p>
          <p className="mt-3 max-w-xs text-sm">
            Hạt cà phê, dụng cụ pha chế và phụ kiện cho những buổi sáng trọn vị.
          </p>
        </div>
        <LinkList title="Cửa hàng" links={MAIN_NAV} />
        <LinkList title="Hỗ trợ" links={FOOTER_LINKS} />
        <LinkList title="Chính sách" links={POLICY_LINKS} />
        <section aria-label="Liên hệ" className="sm:col-span-2 lg:col-span-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-coffee-100">
            Liên hệ
          </h2>
          <p className="space-x-4 text-cream-200">
            <a
              href={`mailto:${contact.email}`}
              className="inline-block py-1 hover:text-white hover:underline"
            >
              {contact.email}
            </a>
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                className="inline-block py-1 hover:text-white hover:underline"
              >
                {contact.phone}
              </a>
            ) : null}
          </p>
        </section>
      </Container>
      <div className="border-t border-coffee-700">
        <Container className="py-4 text-sm text-cream-200">
          © {new Date().getFullYear()} BeanBox. Dự án demo, thanh toán ở chế độ thử nghiệm.
        </Container>
      </div>
    </footer>
  );
}
