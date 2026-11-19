"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import { useResource } from "@/features/orders/useResource";
import type { WishlistItem } from "@/types/catalog";
import { listWishlist } from "../api";
import { useWishlist } from "../WishlistProvider";

const load = () => listWishlist();

export function WishlistView() {
  const { status, data, retry, setData } = useResource<WishlistItem[]>("wishlist", load);
  const { seed } = useWishlist();

  // Mọi thẻ ở đây đều đang được yêu thích: đồng bộ để nút tim hiện đúng trạng thái ngay.
  useEffect(() => {
    if (data) seed(data.map((p) => p.id));
  }, [data, seed]);

  return (
    <section aria-labelledby="wishlist-heading" className="space-y-4">
      <h1 id="wishlist-heading" className="font-serif text-2xl font-bold text-coffee-900">
        Sản phẩm yêu thích
      </h1>

      {status === "loading" || status === "idle" ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Đang tải danh sách yêu thích"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <ErrorState
          title="Chưa tải được danh sách yêu thích"
          description="Vui lòng thử lại sau ít phút."
          onRetry={retry}
        />
      ) : null}

      {status === "ready" && data && data.length === 0 ? (
        <EmptyState
          title="Bạn chưa có sản phẩm yêu thích"
          description="Bấm vào biểu tượng trái tim trên sản phẩm để lưu lại và xem sau."
          action={<ButtonLink href="/danh-muc/ca-phe-hat">Tiếp tục mua sắm</ButtonLink>}
        />
      ) : null}

      {status === "ready" && data && data.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {data.map((p) => (
            <li key={p.id}>
              <ProductCard
                product={p}
                onWishlistToggled={(wished) => {
                  if (!wished) setData(data.filter((x) => x.id !== p.id));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
