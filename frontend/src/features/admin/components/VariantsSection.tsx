"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { AdminProduct, AdminVariant, InventoryItem } from "@/types/admin";
import { deleteAdminVariant } from "../api/products";
import { adminErrorMessage } from "../errors";
import { formatVnDate, formatVnDateTime } from "../format";
import { stockStatusOf } from "../labels";
import { StockBadge } from "./AdminInventory";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { VariantDialog } from "./VariantDialog";

const th = "px-3 py-3 font-medium";

function sortVariants(list: AdminVariant[]): AdminVariant[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}

function Attrs({ v }: { v: AdminVariant }) {
  const entries = Object.entries(v.attributes);
  if (entries.length === 0) return <span className="text-coffee-600">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {entries.map(([k, val]) => (
        <li key={k} className="rounded-full bg-coffee-100 px-2 py-0.5 text-xs text-coffee-800">
          {k}: {val}
        </li>
      ))}
    </ul>
  );
}

function SaleInfo({ v }: { v: AdminVariant }) {
  if (v.salePrice == null) return <span className="text-coffee-600">—</span>;
  return (
    <div>
      <p>{formatVND(v.salePrice)}</p>
      {v.saleStart || v.saleEnd ? (
        <p className="text-xs text-coffee-700">
          {v.saleStart ? formatVnDateTime(v.saleStart) : "…"} →{" "}
          {v.saleEnd ? formatVnDateTime(v.saleEnd) : "…"}
        </p>
      ) : null}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-moss-50 px-2 py-0.5 text-xs text-moss-800"
          : "rounded-full bg-coffee-800 px-2 py-0.5 text-xs text-cream-50"
      }
    >
      {active ? "Đang bán" : "Ngừng bán"}
    </span>
  );
}

function Actions({
  v,
  onEdit,
  onStock,
  onDelete,
}: {
  v: AdminVariant;
  onEdit: () => void;
  onStock: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" aria-label={`Sửa biến thể ${v.sku}`} onClick={onEdit}>
        Sửa
      </Button>
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Điều chỉnh tồn ${v.sku}`}
        onClick={onStock}
      >
        Điều chỉnh tồn
      </Button>
      <Button size="sm" variant="danger" aria-label={`Xóa biến thể ${v.sku}`} onClick={onDelete}>
        Xóa
      </Button>
    </div>
  );
}

/** Khối biến thể trong trang sửa sản phẩm. */
export function VariantsSection({
  product,
  readOnly,
  onChange,
}: {
  product: AdminProduct;
  readOnly: boolean;
  onChange: (variants: AdminVariant[]) => void;
}) {
  const variants = product.variants;
  const [form, setForm] = useState<{ variant?: AdminVariant } | null>(null);
  const [stockId, setStockId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminVariant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminVariant(toDelete.id);
      onChange(variants.filter((v) => v.id !== toDelete.id));
      setNotice(`Đã xóa biến thể ${toDelete.sku}.`);
    } catch (err) {
      setNotice("");
      setError(
        err instanceof ApiError && err.code === "CONFLICT" ? err.message : adminErrorMessage(err),
      );
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  const stockVariant = variants.find((v) => v.id === stockId);
  const stockItem: InventoryItem | null = stockVariant
    ? {
        variantId: stockVariant.id,
        sku: stockVariant.sku,
        variantName: stockVariant.name,
        productId: product.id,
        productName: product.name,
        productStatus: product.status,
        imageUrl: product.images.find((i) => i.isPrimary)?.url ?? null,
        stock: stockVariant.stock,
        lowStockThreshold: stockVariant.lowStockThreshold,
        stockStatus: stockVariant.stockStatus,
        isActive: stockVariant.isActive,
        updatedAt: stockVariant.updatedAt,
      }
    : null;

  function patchStock(id: string, stock: number) {
    onChange(
      variants.map((v) =>
        v.id === id ? { ...v, stock, stockStatus: stockStatusOf(stock, v.lowStockThreshold) } : v,
      ),
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-coffee-900">Biến thể</h2>
        {readOnly ? null : <Button onClick={() => setForm({})}>Thêm biến thể</Button>}
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {notice}
      </p>
      <FormError>{error}</FormError>

      {variants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-coffee-300 bg-cream-50 p-4 text-sm text-coffee-800">
          Sản phẩm chưa có biến thể. Thêm ít nhất 1 biến thể đang bán để có thể chuyển sang Đang
          bán.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-coffee-200 lg:block">
            <table className="w-full text-left text-sm text-coffee-900">
              <caption className="sr-only">Biến thể của sản phẩm</caption>
              <thead className="bg-cream-50 text-coffee-700">
                <tr>
                  <th scope="col" className={th}>
                    SKU / Tên
                  </th>
                  <th scope="col" className={th}>
                    Thuộc tính
                  </th>
                  <th scope="col" className={th}>
                    Giá
                  </th>
                  <th scope="col" className={th}>
                    Giá sale
                  </th>
                  <th scope="col" className={th}>
                    Giá hiệu lực
                  </th>
                  <th scope="col" className={th}>
                    Tồn
                  </th>
                  <th scope="col" className={th}>
                    Khối lượng
                  </th>
                  <th scope="col" className={th}>
                    Ngày rang
                  </th>
                  <th scope="col" className={th}>
                    Bán
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-100">
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs">{v.sku}</p>
                      <p className="font-medium">{v.name}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Attrs v={v} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVND(v.price)}</td>
                    <td className="px-3 py-3">
                      <SaleInfo v={v} />
                    </td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">
                      {formatVND(v.effectivePrice)}
                      {v.isOnSale ? (
                        <p className="text-xs font-normal text-moss-800">Đang sale</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold">{v.stock}</p>
                      <StockBadge status={v.stockStatus} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{v.weightGram} g</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {v.roastDate ? formatVnDate(`${v.roastDate}T00:00:00+07:00`) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <ActiveBadge active={v.isActive} />
                    </td>
                    <td className="px-3 py-3">
                      {readOnly ? null : (
                        <Actions
                          v={v}
                          onEdit={() => setForm({ variant: v })}
                          onStock={() => setStockId(v.id)}
                          onDelete={() => setToDelete(v)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {variants.map((v) => (
              <li key={v.id} className="space-y-3 rounded-xl border border-coffee-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-coffee-900">{v.name}</p>
                    <p className="font-mono text-xs text-coffee-700">SKU {v.sku}</p>
                  </div>
                  <ActiveBadge active={v.isActive} />
                </div>
                <Attrs v={v} />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-coffee-700">Giá</dt>
                  <dd>{formatVND(v.price)}</dd>
                  <dt className="text-coffee-700">Giá sale</dt>
                  <dd>
                    <SaleInfo v={v} />
                  </dd>
                  <dt className="text-coffee-700">Giá hiệu lực</dt>
                  <dd className="font-semibold">{formatVND(v.effectivePrice)}</dd>
                  <dt className="text-coffee-700">Tồn</dt>
                  <dd>
                    {v.stock} <StockBadge status={v.stockStatus} />
                  </dd>
                  <dt className="text-coffee-700">Khối lượng</dt>
                  <dd>{v.weightGram} g</dd>
                  <dt className="text-coffee-700">Ngày rang</dt>
                  <dd>{v.roastDate ? formatVnDate(`${v.roastDate}T00:00:00+07:00`) : "—"}</dd>
                </dl>
                {readOnly ? null : (
                  <Actions
                    v={v}
                    onEdit={() => setForm({ variant: v })}
                    onStock={() => setStockId(v.id)}
                    onDelete={() => setToDelete(v)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {form ? (
        <VariantDialog
          productId={product.id}
          variant={form.variant}
          onClose={() => setForm(null)}
          onSaved={(saved, mode) => {
            onChange(
              sortVariants(
                mode === "create"
                  ? [...variants, saved]
                  : variants.map((v) => (v.id === saved.id ? saved : v)),
              ),
            );
            setForm(null);
            setError(null);
            setNotice(
              mode === "create"
                ? `Đã thêm biến thể ${saved.sku}.`
                : `Đã lưu biến thể ${saved.sku}.`,
            );
          }}
        />
      ) : null}

      {stockItem ? (
        <StockAdjustDialog
          item={stockItem}
          onClose={() => setStockId(null)}
          onStockChanged={(cur) => patchStock(stockItem.variantId, cur)}
          onAdjusted={(updated, before) => {
            patchStock(updated.variantId, updated.stock);
            setStockId(null);
            setError(null);
            setNotice(
              before === updated.stock
                ? `Tồn kho ${updated.sku} không thay đổi (${updated.stock}).`
                : `Đã cập nhật tồn kho ${updated.sku}: ${before} → ${updated.stock}.`,
            );
          }}
        />
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Xóa biến thể"
          description={`Xóa biến thể "${toDelete.name}" (SKU ${toDelete.sku})? SKU này vẫn bị giữ và không thể dùng lại.`}
          confirmLabel="Xóa biến thể"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </section>
  );
}
