"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ProductImage as ProductImageType } from "@/types/catalog";
import { ProductImage } from "./ProductImage";

export function ProductGallery({ images, name }: { images: ProductImageType[]; name: string }) {
  const ordered = [...images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const [index, setIndex] = useState(0);
  const current = ordered[index] ?? ordered[0];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-coffee-200">
        <ProductImage
          src={current?.url}
          alt={current?.alt}
          name={name}
          priority
          sizes="(min-width: 1024px) 40vw, (min-width: 768px) 50vw, 100vw"
        />
      </div>
      {ordered.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Ảnh sản phẩm">
          {ordered.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Xem ảnh ${i + 1} trên ${ordered.length}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "block h-16 w-16 overflow-hidden rounded-lg border-2 sm:h-20 sm:w-20",
                  i === index ? "border-moss-700" : "border-transparent hover:border-coffee-300",
                )}
              >
                <ProductImage src={img.url} alt="" name={name} sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
