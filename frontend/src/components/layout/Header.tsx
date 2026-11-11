import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { MAIN_NAV } from "@/lib/site";
import { HeaderAccount } from "./HeaderAccount";
import { HeaderCart } from "./HeaderCart";

export function Header() {
  return (
    <header className="sticky top-0 z-30 print:hidden border-b border-coffee-200 bg-cream-50/95 backdrop-blur">
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
          // min-w: không để link/icon bên cạnh ép ô tìm kiếm xuống còn vài chục px;
          // thiếu chỗ thì flex-wrap đẩy cả ô xuống hàng dưới.
          className="ml-auto min-w-40 flex-1 md:max-w-xs lg:min-w-48"
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

        <div className="flex shrink-0 items-center">
          <HeaderCart />
          <HeaderAccount />
        </div>
      </Container>
    </header>
  );
}
