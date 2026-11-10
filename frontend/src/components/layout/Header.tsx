import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { MAIN_NAV } from "@/lib/site";

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.78L20 8H6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.4-3.6 4.4-5 8-5s6.6 1.4 8 5" strokeLinecap="round" />
    </svg>
  );
}

const iconLink =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg text-coffee-800 hover:bg-coffee-100";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-coffee-200 bg-cream-50/95 backdrop-blur">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
        <Link
          href="/"
          className="font-serif text-2xl font-bold text-coffee-800"
          aria-label="BeanBox - Trang chủ"
        >
          Bean<span className="text-moss-700">Box</span>
        </Link>

        <nav
          aria-label="Danh mục chính"
          className="order-3 w-full overflow-x-auto md:order-none md:w-auto"
        >
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-coffee-800 hover:bg-coffee-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form
          action="/tim-kiem"
          method="get"
          role="search"
          className="ml-auto min-w-0 flex-1 md:max-w-xs"
        >
          <label htmlFor="site-search" className="sr-only">
            Tìm kiếm sản phẩm
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder="Tìm hạt cà phê, phin, bình pha..."
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-sm text-coffee-900 placeholder:text-coffee-600/70"
          />
        </form>

        <div className="flex items-center">
          <Link href="/gio-hang" className={iconLink} aria-label="Giỏ hàng">
            <CartIcon />
          </Link>
          <Link href="/dang-nhap" className={iconLink} aria-label="Tài khoản">
            <UserIcon />
          </Link>
        </div>
      </Container>
    </header>
  );
}
