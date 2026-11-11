"use client";

import { useEffect, useId, useRef } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { formatVND } from "@/lib/format";
import { useCart } from "../CartProvider";

const FOCUSABLE = 'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function MiniCart() {
  const { miniCartOpen } = useCart();
  return miniCartOpen ? <MiniCartDialog /> : null;
}

function MiniCartDialog() {
  const { cart, closeMiniCart } = useCart();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(closeMiniCart);
  useEffect(() => {
    closeRef.current = closeMiniCart;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    boxRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && boxRef.current) {
        const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === boxRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const items = cart?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-coffee-900/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMiniCart();
      }}
      data-testid="minicart-overlay"
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-cream-50 shadow-xl outline-none sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-coffee-200 px-4 py-3">
          <h2 id={titleId} className="font-serif text-lg font-bold text-coffee-900">
            Giỏ hàng của bạn
          </h2>
          <button
            type="button"
            onClick={closeMiniCart}
            aria-label="Đóng giỏ hàng"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-xl text-coffee-800 hover:bg-coffee-100"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-coffee-700">Giỏ hàng của bạn đang trống.</p>
          ) : (
            <ul className="divide-y divide-coffee-200">
              {items.map((item) => (
                <li key={item.id} className="flex min-w-0 gap-3 py-3">
                  <ProductImage
                    src={item.product.imageUrl}
                    name={item.product.name}
                    sizes="64px"
                    className="h-16 w-16 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-coffee-900">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-coffee-700">{item.variant.name}</p>
                    <p className="mt-1 text-sm text-coffee-800">Số lượng: {item.quantity}</p>
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-coffee-900">
                    {formatVND(item.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-coffee-200 px-4 py-4">
          <div className="flex items-center justify-between text-coffee-900">
            <span>Tạm tính</span>
            <span className="text-lg font-bold">{formatVND(cart?.subtotal ?? 0)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink href="/gio-hang" variant="outline">
              Xem giỏ hàng
            </ButtonLink>
            <ButtonLink href="/thanh-toan">Thanh toán</ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
