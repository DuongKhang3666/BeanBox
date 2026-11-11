"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminBrand } from "@/types/admin";
import { deleteAdminBrand, listAdminBrands } from "../api/catalog";
import { adminErrorMessage } from "../errors";
import { BrandForm } from "./BrandForm";

const load = () => listAdminBrands();

function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === "CONFLICT") {
    const n = (err.details as { productCount?: number } | undefined)?.productCount;
    if (typeof n === "number")
      return `Thương hiệu còn ${n} sản phẩm, hãy đổi thương hiệu cho các sản phẩm đó trước khi xóa`;
    return err.message;
  }
  return adminErrorMessage(err);
}

function Logo({ brand }: { brand: AdminBrand }) {
  if (!brand.logoUrl) return null;
  return (
    <ProductImage
      src={brand.logoUrl}
      name={brand.name}
      sizes="40px"
      className="h-10 w-10 shrink-0 rounded-lg"
    />
  );
}

function Actions({
  brand,
  isAdmin,
  onEdit,
  onDelete,
}: {
  brand: AdminBrand;
  isAdmin: boolean;
  onEdit: (b: AdminBrand) => void;
  onDelete: (b: AdminBrand) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Sửa ${brand.name}`}
        onClick={() => onEdit(brand)}
      >
        Sửa
      </Button>
      {isAdmin ? (
        <Button
          size="sm"
          variant="danger"
          aria-label={`Xóa ${brand.name}`}
          onClick={() => onDelete(brand)}
        >
          Xóa
        </Button>
      ) : null}
    </div>
  );
}

const th = "px-3 py-3 font-medium";

export function AdminBrands() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const res = useResource<AdminBrand[]>("brands", load);
  const [form, setForm] = useState<{ brand?: AdminBrand } | null>(null);
  const [toDelete, setToDelete] = useState<AdminBrand | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminBrand(toDelete.id);
      setNotice(`Đã xóa thương hiệu ${toDelete.name}.`);
      res.retry();
    } catch (err) {
      setNotice("");
      setError(deleteErrorMessage(err));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = (
      <div aria-busy="true" aria-label="Đang tải thương hiệu" role="status" className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được thương hiệu"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.length === 0) {
    body = (
      <EmptyState
        title="Chưa có thương hiệu nào"
        description="Thêm thương hiệu đầu tiên để gắn cho sản phẩm."
        action={<Button onClick={() => setForm({})}>Thêm thương hiệu</Button>}
      />
    );
  } else {
    const brands = res.data!;
    body = (
      <>
        <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
          <table className="w-full text-left text-sm text-coffee-900">
            <caption className="sr-only">Danh sách thương hiệu</caption>
            <thead className="bg-cream-50 text-coffee-700">
              <tr>
                <th scope="col" className={th}>
                  Thương hiệu
                </th>
                <th scope="col" className={th}>
                  Slug
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Số sản phẩm
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-100">
              {brands.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Logo brand={b} />
                      <span className="font-medium">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono">{b.slug}</td>
                  <td className="px-3 py-3 text-right">{b.productCount}</td>
                  <td className="px-3 py-3">
                    <Actions
                      brand={b}
                      isAdmin={isAdmin}
                      onEdit={(brand) => setForm({ brand })}
                      onDelete={setToDelete}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">
          {brands.map((b) => (
            <li key={b.id} className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <Logo brand={b} />
                <div className="min-w-0">
                  <p className="font-medium text-coffee-900">{b.name}</p>
                  <p className="text-sm text-coffee-700">
                    <span className="font-mono">{b.slug}</span> · {b.productCount} sản phẩm
                  </p>
                </div>
              </div>
              <Actions
                brand={b}
                isAdmin={isAdmin}
                onEdit={(brand) => setForm({ brand })}
                onDelete={setToDelete}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Thương hiệu</h1>
        <Button onClick={() => setForm({})}>Thêm thương hiệu</Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {notice}
      </p>
      <FormError>{error}</FormError>

      {body}

      {form ? (
        <BrandForm
          brand={form.brand}
          onClose={() => setForm(null)}
          onSaved={(saved, mode) => {
            setForm(null);
            setError(null);
            setNotice(
              mode === "create"
                ? `Đã tạo thương hiệu ${saved.name}.`
                : `Đã lưu thương hiệu ${saved.name}.`,
            );
            res.retry();
          }}
        />
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Xóa thương hiệu"
          description={`Xóa thương hiệu "${toDelete.name}"? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa thương hiệu"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </div>
  );
}
