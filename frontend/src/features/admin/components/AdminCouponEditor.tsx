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
import type { AdminCategory, AdminCoupon } from "@/types/admin";
import { listAdminCategories } from "../api/catalog";
import { deleteAdminCoupon, getAdminCoupon, updateAdminCoupon } from "../api/coupons";
import { getAdminProduct } from "../api/products";
import { COUPONS_BASE } from "../couponFilters";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { COUPON_TYPE_LABEL } from "../labels";
import { CouponStateBadge } from "./AdminCoupons";
import { CouponForm } from "./CouponForm";

interface Loaded {
  coupon: AdminCoupon;
  categories: AdminCategory[];
  productNames: Record<string, string>;
}

/** Tên sản phẩm trong scope để hiển thị chip; sản phẩm không tải được thì bỏ qua (chip rút gọn). */
async function resolveProductNames(ids: string[]): Promise<Record<string, string>> {
  const settled = await Promise.allSettled(ids.map((id) => getAdminProduct(id)));
  const out: Record<string, string> = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") out[ids[i]!] = r.value.name;
  });
  return out;
}

const load = async (id: string): Promise<Loaded> => {
  const [coupon, categories] = await Promise.all([getAdminCoupon(id), listAdminCategories()]);
  const productNames = await resolveProductNames(coupon.scope?.productIds ?? []);
  return { coupon, categories, productNames };
};

const DELETE_CONFLICT = "Mã đã được dùng, hãy tắt mã thay vì xóa";

function Editor({ loaded }: { loaded: Loaded }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [coupon, setCoupon] = useState<AdminCoupon>(loaded.coupon);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    setConflict(false);
    try {
      await deleteAdminCoupon(coupon.id);
      router.push(COUPONS_BASE);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") setConflict(true);
      else setDeleteError(adminErrorMessage(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function onDisable() {
    setDisabling(true);
    setDeleteError(null);
    try {
      const updated = await updateAdminCoupon(coupon.id, { isActive: false });
      setCoupon(updated);
      setConflict(false);
      setNotice("Đã tắt mã giảm giá.");
    } catch (err) {
      setDeleteError(adminErrorMessage(err));
    } finally {
      setDisabling(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link href={COUPONS_BASE} className="text-sm text-moss-800 underline">
          ← Danh sách mã giảm giá
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-mono text-2xl font-bold break-all text-coffee-900">
              {coupon.code}
            </h1>
            <p className="text-sm text-coffee-700">{COUPON_TYPE_LABEL[coupon.type]}</p>
          </div>
          <CouponStateBadge state={coupon.state} />
        </div>
        <p className="text-sm text-coffee-800">
          Đã dùng {coupon.usedCount.toLocaleString("vi-VN")} lượt
          {coupon.usageLimit != null
            ? ` trên tổng ${coupon.usageLimit.toLocaleString("vi-VN")} lượt`
            : ""}
          . Cập nhật lần cuối: {formatVnDateTime(coupon.updatedAt)}
        </p>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p className="rounded-lg border border-moss-600/40 bg-moss-50 px-3 py-2 text-sm text-moss-800">
            {notice}
          </p>
        ) : null}
      </div>

      <CouponForm
        key={`${coupon.id}-${coupon.updatedAt}`}
        coupon={coupon}
        categories={loaded.categories}
        productNames={loaded.productNames}
        onSaved={(saved) => {
          setCoupon(saved);
          setNotice("Đã lưu thay đổi.");
        }}
      />

      {isAdmin ? (
        <section className="space-y-3 rounded-2xl border border-danger-600/40 bg-white p-4 sm:p-5">
          <h2 className="font-serif text-lg font-bold text-danger-600">Xóa mã giảm giá</h2>
          <p className="text-sm text-coffee-800">
            Chỉ xóa được mã chưa từng được dùng. Mã đã dùng hãy tắt thay vì xóa.
          </p>
          {conflict ? (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-2 text-danger-600"
            >
              <p>{DELETE_CONFLICT}</p>
              {coupon.isActive ? (
                <Button variant="outline" size="sm" loading={disabling} onClick={onDisable}>
                  Tắt mã
                </Button>
              ) : null}
            </div>
          ) : null}
          <FormError>{deleteError}</FormError>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Xóa mã giảm giá
          </Button>
        </section>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Xóa mã giảm giá"
          description={`Xóa mã "${coupon.code}"? Không thể hoàn tác.`}
          confirmLabel="Xóa mã"
          busy={deleting}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}

export function AdminCouponEditor({ id }: { id: string }) {
  const res = useResource<Loaded>(id, load);

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải mã giảm giá" role="status" className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 404) {
      return (
        <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
          <h1 className="font-serif text-xl font-bold text-coffee-900">
            Không tìm thấy mã giảm giá
          </h1>
          <Link href={COUPONS_BASE} className={buttonClasses("primary")}>
            Về danh sách mã giảm giá
          </Link>
        </div>
      );
    }
    return (
      <ErrorState
        title="Không tải được mã giảm giá"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }
  return <Editor key={id} loaded={res.data!} />;
}
