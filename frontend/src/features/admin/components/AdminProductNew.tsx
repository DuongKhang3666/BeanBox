"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import type { AdminBrand, AdminCategory } from "@/types/admin";
import { listAdminBrands, listAdminCategories } from "../api/catalog";
import { adminErrorMessage } from "../errors";
import { PRODUCTS_BASE } from "../productFilters";
import { ProductForm } from "./ProductForm";

const load = async () => {
  const [categories, brands] = await Promise.all([listAdminCategories(), listAdminBrands()]);
  return { categories, brands } as { categories: AdminCategory[]; brands: AdminBrand[] };
};

export function AdminProductNew() {
  const router = useRouter();
  const res = useResource("product-form-options", load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = (
      <div aria-busy="true" aria-label="Đang tải biểu mẫu" role="status" className="space-y-3">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được danh mục và thương hiệu"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    body = (
      <ProductForm
        categories={res.data!.categories}
        brands={res.data!.brands}
        onSaved={(saved) => router.push(`${PRODUCTS_BASE}/${saved.id}`)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={PRODUCTS_BASE} className="text-sm text-moss-800 underline">
          ← Danh sách sản phẩm
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-coffee-900">Thêm sản phẩm</h1>
        <p className="mt-1 text-sm text-coffee-700">
          Sau khi tạo, bạn có thể thêm biến thể và ảnh ở trang chỉnh sửa.
        </p>
      </div>
      {body}
    </div>
  );
}
