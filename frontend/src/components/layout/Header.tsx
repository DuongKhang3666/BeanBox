import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { MAIN_NAV } from "@/lib/site";
import { HeaderAccount } from "./HeaderAccount";
import { HeaderCart } from "./HeaderCart";
import { MobileCategoryMenu } from "./MobileCategoryMenu";
import { SearchBox } from "./SearchBox";

export function Header() {
  return (
    <header className="sticky top-0 z-30 print:hidden border-b border-coffee-200 bg-cream-50/95 backdrop-blur">
      <Container className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2 md:gap-x-4">
        <Link
          href="/"
          className="order-1 font-serif text-2xl font-bold text-coffee-800 md:order-none"
          aria-label="BeanBox - Trang chủ"
        >
          Bean<span className="text-moss-700">Box</span>
        </Link>

        {/* Mobile (< md): hàng 1 = logo + nút Danh mục + giỏ/tài khoản, hàng 2 = ô tìm kiếm;
            nav ngang chỉ hiện từ md. Nút/bảng Danh mục chỉ hiện dưới md (D-059). */}
        <MobileCategoryMenu className="order-2 ml-auto md:hidden" />

        <nav aria-label="Danh mục chính" className="hidden md:block">
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

        {/* min-w: không để link/icon bên cạnh ép ô tìm kiếm xuống còn vài chục px;
            thiếu chỗ thì flex-wrap đẩy cả ô xuống hàng dưới. */}
        <SearchBox className="order-4 min-w-full flex-1 md:order-none md:ml-auto md:min-w-40 md:max-w-xs lg:min-w-48" />

        <div className="order-3 flex shrink-0 items-center md:order-none">
          <HeaderCart />
          <HeaderAccount />
        </div>
      </Container>
    </header>
  );
}
