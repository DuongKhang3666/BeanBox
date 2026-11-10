"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

interface ProductImageProps {
  src: string | null | undefined;
  alt?: string | null;
  /** Tên sản phẩm: dùng làm alt dự phòng và chữ trong placeholder. */
  name: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/** Ảnh sản phẩm; null hoặc lỗi tải -> khối placeholder nâu/kem có tên sản phẩm. */
export function ProductImage({
  src,
  alt,
  name,
  sizes,
  priority = false,
  className,
}: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden bg-cream-200", className)}>
      {failed ? (
        <div
          role="img"
          aria-label={alt?.trim() || name}
          className="flex h-full w-full items-center justify-center bg-linear-to-br from-cream-200 to-coffee-100 p-4 text-center"
        >
          <span className="line-clamp-4 font-serif text-base font-semibold text-coffee-700">
            {name}
          </span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt?.trim() || name}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={/\.svg(\?|$)/i.test(src)}
          onError={() => setFailedSrc(src)}
          className="object-cover"
        />
      )}
    </div>
  );
}
