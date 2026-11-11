"use client";

import Link from "next/link";
import { useCart } from "@/features/cart/CartProvider";

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

/** Link giỏ hàng + badge số lượng. Client component để đọc state giỏ. */
export function HeaderCart() {
  const { cart } = useCart();
  const count = cart?.itemCount ?? 0;
  return (
    <Link
      href="/gio-hang"
      aria-label={`Giỏ hàng, ${count} sản phẩm`}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-coffee-800 hover:bg-coffee-100"
    >
      <CartIcon />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0 top-0.5 min-w-5 rounded-full bg-moss-700 px-1 text-center text-xs font-semibold leading-5 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
