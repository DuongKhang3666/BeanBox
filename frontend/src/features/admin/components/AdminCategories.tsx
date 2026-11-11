"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminCategory } from "@/types/admin";
import { deleteAdminCategory, listAdminCategories } from "../api/catalog";
import { adminErrorMessage } from "../errors";
import { CategoryForm } from "./CategoryForm";

const load = () => listAdminCategories();

type FormState = { category?: AdminCategory; defaultParentId?: string } | null;

function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === "CONFLICT") {
    const d = (err.details ?? {}) as { childCount?: number; productCount?: number };
    if (typeof d.childCount === "number" || typeof d.productCount === "number") {
      return `Danh mục còn ${d.childCount ?? 0} danh mục con / ${d.productCount ?? 0} sản phẩm, hãy ẩn thay vì xóa`;
    }
    return err.message;
  }
  return adminErrorMessage(err);
}

function CategoryRow({
  cat,
  isChild,
  isAdmin,
  onEdit,
  onAddChild,
  onDelete,
}: {
  cat: AdminCategory;
  isChild: boolean;
  isAdmin: boolean;
  onEdit: (c: AdminCategory) => void;
  onAddChild: (c: AdminCategory) => void;
  onDelete: (c: AdminCategory) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-coffee-900">{cat.name}</span>
          {!cat.isActive ? (
            <span className="rounded-full bg-coffee-800 px-2 py-0.5 text-xs text-cream-50">
              Đang ẩn
            </span>
          ) : null}
        </p>
        <p className="text-sm text-coffee-700">
          <span className="font-mono">{cat.slug}</span> · {cat.productCount} sản phẩm · Thứ tự{" "}
          {cat.sortOrder}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label={`Sửa ${cat.name}`}
          onClick={() => onEdit(cat)}
        >
          Sửa
        </Button>
        {!isChild ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Thêm danh mục con cho ${cat.name}`}
            onClick={() => onAddChild(cat)}
          >
            Thêm danh mục con
          </Button>
        ) : null}
        {isAdmin ? (
          <Button
            size="sm"
            variant="danger"
            aria-label={`Xóa ${cat.name}`}
            onClick={() => onDelete(cat)}
          >
            Xóa
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function AdminCategories() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const res = useResource<AdminCategory[]>("categories", load);
  const [form, setForm] = useState<FormState>(null);
  const [toDelete, setToDelete] = useState<AdminCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminCategory(toDelete.id);
      setNotice(`Đã xóa danh mục ${toDelete.name}.`);
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
      <div aria-busy="true" aria-label="Đang tải danh mục" role="status" className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được danh mục"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.length === 0) {
    body = (
      <EmptyState
        title="Chưa có danh mục nào"
        description="Tạo danh mục đầu tiên để phân loại sản phẩm."
        action={<Button onClick={() => setForm({})}>Thêm danh mục</Button>}
      />
    );
  } else {
    body = (
      <ul className="space-y-3">
        {res.data!.map((root) => (
          <li key={root.id} className="rounded-2xl border border-coffee-200 bg-white p-4">
            <CategoryRow
              cat={root}
              isChild={false}
              isAdmin={isAdmin}
              onEdit={(category) => setForm({ category })}
              onAddChild={(c) => setForm({ defaultParentId: c.id })}
              onDelete={setToDelete}
            />
            {(root.children?.length ?? 0) > 0 ? (
              <ul className="mt-3 space-y-3 border-l-2 border-coffee-200 pl-3 sm:pl-5">
                {root.children!.map((child) => (
                  <li key={child.id} className="border-t border-coffee-100 pt-3 first:border-t-0">
                    <CategoryRow
                      cat={child}
                      isChild
                      isAdmin={isAdmin}
                      onEdit={(category) => setForm({ category })}
                      onAddChild={() => undefined}
                      onDelete={setToDelete}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Danh mục</h1>
        <Button onClick={() => setForm({})}>Thêm danh mục</Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {notice}
      </p>
      <FormError>{error}</FormError>

      {body}

      {form ? (
        <CategoryForm
          category={form.category}
          defaultParentId={form.defaultParentId}
          roots={res.data ?? []}
          onClose={() => setForm(null)}
          onSaved={(saved, mode) => {
            setForm(null);
            setError(null);
            setNotice(
              mode === "create"
                ? `Đã tạo danh mục ${saved.name}.`
                : `Đã lưu danh mục ${saved.name}.`,
            );
            res.retry();
          }}
        />
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Xóa danh mục"
          description={`Xóa danh mục "${toDelete.name}"? Thao tác này không thể hoàn tác. Nếu danh mục còn danh mục con hoặc sản phẩm, hãy ẩn thay vì xóa.`}
          confirmLabel="Xóa danh mục"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </div>
  );
}
