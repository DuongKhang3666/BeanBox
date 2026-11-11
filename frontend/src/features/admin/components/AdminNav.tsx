"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

export const ADMIN_NAV = [
  { href: "/admin/don-hang", label: "Đơn hàng" },
  { href: "/admin/ton-kho", label: "Tồn kho" },
  { href: "/admin/ma-giam-gia", label: "Mã giảm giá" },
  { href: "/admin/san-pham", label: "Sản phẩm" },
  { href: "/admin/danh-muc", label: "Danh mục" },
  { href: "/admin/thuong-hieu", label: "Thương hiệu" },
] as const;

/** Sidebar trên desktop; trên mobile là menu thu gọn bằng nút. */
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav aria-label="Quản trị" className="print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-nav-list"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-coffee-300 bg-white px-4 text-sm font-semibold text-coffee-900 md:hidden"
      >
        <span>Menu quản trị</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      <ul
        id="admin-nav-list"
        className={cn("mt-2 space-y-1 md:mt-0 md:block", open ? "block" : "hidden")}
      >
        {ADMIN_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-11 items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600",
                  active ? "bg-coffee-800 text-cream-50" : "text-coffee-800 hover:bg-coffee-100",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
