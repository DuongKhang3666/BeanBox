"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdminProduct } from "@/types/admin";
import { restoreProduct } from "../api/products";
import { adminErrorMessage } from "../errors";

/**
 * Khôi phục sản phẩm đã xóa mềm (§14.6, D-018). Chỉ ADMIN thấy. Sản phẩm về trạng thái Nháp.
 * 409 -> hiện message của server (vd. sản phẩm đã được khôi phục ở nơi khác).
 */
export function RestoreProductButton({
  productId,
  productName,
  onRestored,
}: {
  productId: string;
  productName: string;
  onRestored: (product: AdminProduct) => void;
}) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== "ADMIN") return null;

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const product = await restoreProduct(productId);
      setConfirm(false);
      onRestored(product);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "CONFLICT" && err.message
          ? err.message
          : adminErrorMessage(err),
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Khôi phục sản phẩm ${productName}`}
        onClick={() => setConfirm(true)}
      >
        Khôi phục
      </Button>
      <FormError>{error}</FormError>
      {confirm ? (
        <ConfirmDialog
          title="Khôi phục sản phẩm"
          description={`Khôi phục "${productName}"? Sản phẩm sẽ về trạng thái Nháp; bạn cần kiểm tra rồi bật bán lại.`}
          confirmLabel="Khôi phục"
          busy={busy}
          onConfirm={onConfirm}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </div>
  );
}
