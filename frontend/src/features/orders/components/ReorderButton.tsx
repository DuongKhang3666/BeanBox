"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { useCart } from "@/features/cart/CartProvider";
import type { ReorderResult, ReorderSkipReason } from "@/types/order";
import { reorderOrder } from "../api";
import { orderErrorMessage } from "../labels";

const SKIP_LABEL: Record<ReorderSkipReason, string> = {
  DISCONTINUED: "đã ngừng bán",
  OUT_OF_STOCK: "hết hàng",
  UNAVAILABLE: "không thể thêm (giỏ đã đạt số lượng tối đa của sản phẩm này)",
};

const lineName = (l: { productName: string; variantName: string }) =>
  l.variantName && l.variantName !== l.productName
    ? `${l.productName} (${l.variantName})`
    : l.productName;

/** Tóm tắt kết quả mua lại bằng tiếng Việt. Hàm thuần, dùng chung cho UI và test. */
export function reorderSummary(r: Pick<ReorderResult, "added" | "adjusted" | "skipped">): {
  headline: string;
  adjusted: string[];
  skipped: string[];
} {
  const addedCount = r.added.length + r.adjusted.length;
  const headline =
    addedCount === 0
      ? "Chưa thêm được sản phẩm nào vào giỏ hàng."
      : `Đã thêm ${addedCount} sản phẩm vào giỏ hàng.`;
  return {
    headline,
    adjusted: r.adjusted.map(
      (l) => `${lineName(l)}: chỉ thêm được ${l.added}/${l.requested} do không đủ hàng.`,
    ),
    skipped: r.skipped.map((l) => `${lineName(l)}: ${SKIP_LABEL[l.reason] ?? "không thể thêm"}.`),
  };
}

/** D-077: nút "Mua lại" ở chi tiết đơn của tài khoản. */
export function ReorderButton({ code }: { code: string }) {
  const { replaceCart } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof reorderSummary> | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await reorderOrder(code);
      replaceCart(r.cart);
      setResult(reorderSummary(r));
    } catch (err) {
      setResult(null);
      setError(orderErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy} aria-busy={busy}>
        {busy ? "Đang thêm..." : "Mua lại"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
      {result ? (
        <section
          role="status"
          aria-label="Kết quả mua lại"
          className="space-y-2 rounded-2xl border border-moss-200 bg-moss-50 p-4 text-sm text-coffee-900"
        >
          <p className="font-medium">{result.headline}</p>
          {result.adjusted.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {result.adjusted.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          {result.skipped.length > 0 ? (
            <div>
              <p className="font-medium">Không thêm được:</p>
              <ul className="list-disc space-y-1 pl-5">
                {result.skipped.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link href="/gio-hang" className={buttonClasses("primary", "sm")}>
            Xem giỏ hàng
          </Link>
        </section>
      ) : null}
    </div>
  );
}
