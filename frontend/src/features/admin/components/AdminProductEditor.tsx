"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminBrand, AdminCategory, AdminProduct } from "@/types/admin";
import { listAdminBrands, listAdminCategories } from "../api/catalog";
import { deleteAdminProduct, getAdminProduct } from "../api/products";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { PRODUCTS_BASE } from "../productFilters";
import { ProductStatusBadge } from "./AdminProducts";
import { ImagesSection } from "./ImagesSection";
import { ProductForm } from "./ProductForm";
import { VariantsSection } from "./VariantsSection";

interface Loaded {
  product: AdminProduct;
  categories: AdminCategory[];
  brands: AdminBrand[];
}

const load = async (id: string): Promise<Loaded> => {
  const [product, categories, brands] = await Promise.all([
    getAdminProduct(id),
    listAdminCategories(),
    listAdminBrands(),
  ]);
  return { product, categories, brands };
};

function Editor({ loaded }: { loaded: Loaded }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [product, setProduct] = useState<AdminProduct>(loaded.product);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleted = product.deletedAt !== null;

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminProduct(product.id);
      router.push(PRODUCTS_BASE);
    } catch (err) {
      setDeleteError(adminErrorMessage(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link href={PRODUCTS_BASE} className="text-sm text-moss-800 underline">
          ← Danh sách sản phẩm
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-bold break-words text-coffee-900">
              {product.name}
            </h1>
            <p className="font-mono text-sm break-all text-coffee-700">{product.slug}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProductStatusBadge status={product.status} />
            {product.status === "ACTIVE" && !deleted ? (
              <a
                href={`/san-pham/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("outline", "sm")}
              >
                Xem trên cửa hàng
              </a>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-coffee-700">
          Cập nhật lần cuối: {formatVnDateTime(product.updatedAt)}
        </p>
      </div>

      {deleted ? (
        <div
          role="alert"
          className="rounded-xl border border-danger-600/40 bg-danger-50 px-4 py-3 text-danger-600"
        >
          <p className="font-medium">Sản phẩm đã bị xóa</p>
          <p className="text-sm">
            Đã xóa lúc {formatVnDateTime(product.deletedAt!)}. Bạn chỉ có thể xem thông tin.
          </p>
        </div>
      ) : null}

      <ProductForm
        product={product}
        readOnly={deleted}
        categories={loaded.categories}
        brands={loaded.brands}
        onSaved={(saved) =>
          setProduct((cur) => ({ ...cur, ...saved, images: cur.images, variants: cur.variants }))
        }
      />

      <VariantsSection
        product={product}
        readOnly={deleted}
        onChange={(variants) => setProduct((cur) => ({ ...cur, variants }))}
      />

      <ImagesSection
        product={product}
        readOnly={deleted}
        onChange={(images) => setProduct((cur) => ({ ...cur, images }))}
      />

      {isAdmin && !deleted ? (
        <section className="space-y-3 rounded-2xl border border-danger-600/40 bg-white p-4 sm:p-5">
          <h2 className="font-serif text-lg font-bold text-danger-600">Xóa sản phẩm</h2>
          <p className="text-sm text-coffee-800">
            Xóa mềm: sản phẩm biến mất khỏi cửa hàng và không thể khôi phục ở phiên bản này.
          </p>
          <FormError>{deleteError}</FormError>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Xóa sản phẩm
          </Button>
        </section>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Xóa sản phẩm"
          description={`Xóa sản phẩm "${product.name}"? Đây là xóa mềm: sản phẩm biến mất khỏi cửa hàng và không thể khôi phục ở phiên bản này.`}
          confirmLabel="Xóa sản phẩm"
          busy={deleting}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

export function AdminProductEditor({ id }: { id: string }) {
  const res = useResource<Loaded>(id, load);

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải sản phẩm" role="status" className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 404) {
      return (
        <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
          <h1 className="font-serif text-xl font-bold text-coffee-900">Không tìm thấy sản phẩm</h1>
          <Link href={PRODUCTS_BASE} className={buttonClasses("primary")}>
            Về danh sách sản phẩm
          </Link>
        </div>
      );
    }
    return (
      <ErrorState
        title="Không tải được sản phẩm"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }
  return <Editor key={id} loaded={res.data!} />;
}
