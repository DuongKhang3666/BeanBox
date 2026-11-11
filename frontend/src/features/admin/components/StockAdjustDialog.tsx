"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdjustInventoryInput, AdjustReason, InventoryItem } from "@/types/admin";
import { adjustInventory } from "../api/inventory";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { ADJUST_REASONS, INVENTORY_REASON_LABEL } from "../labels";
import { AdminModal } from "./AdminModal";

const MAX = 100000;
const INT_RE = /^[+-]?\d+$/;

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const AMOUNT_LABEL: Record<AdjustReason, string> = {
  RESTOCK: "Số lượng nhập",
  DAMAGE: "Số lượng hư hỏng (giảm)",
  ADJUSTMENT: "Thay đổi (+ tăng, - giảm)",
  STOCKTAKE: "Tồn kho thực tế",
};

const NOTE_REQUIRED: Record<AdjustReason, boolean> = {
  RESTOCK: false,
  DAMAGE: true,
  ADJUSTMENT: true,
  STOCKTAKE: false,
};

/** Tồn sau dự kiến; null nếu số chưa hợp lệ. */
export function projectedStock(item: InventoryItem, reason: AdjustReason, raw: string) {
  const text = raw.trim();
  if (!INT_RE.test(text)) return null;
  const n = Number(text);
  if (reason === "STOCKTAKE") return n >= 0 ? n : null;
  if (reason === "DAMAGE") return item.stock - Math.abs(n);
  return item.stock + n;
}

/** Hộp thoại điều chỉnh tồn kho một biến thể (§12.2). */
export function StockAdjustDialog({
  item,
  onAdjusted,
  onStockChanged,
  onClose,
}: {
  item: InventoryItem;
  /** Thành công: cập nhật dòng từ response. */
  onAdjusted: (item: InventoryItem, before: number) => void;
  /** 409: tồn thực tế đã khác, cha cập nhật dòng (item.stock đổi theo). */
  onStockChanged: (currentStock: number) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<AdjustReason>("RESTOCK");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const after = projectedStock(item, reason, amount);
  const noteRequired = NOTE_REQUIRED[reason];

  function changeReason(next: AdjustReason) {
    setReason(next);
    setAmount("");
    setErrors({});
    setGeneral(null);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const text = amount.trim();
    const n = Number(text);
    if (!INT_RE.test(text)) {
      e.amount = "Vui lòng nhập một số nguyên.";
    } else if (reason === "RESTOCK") {
      if (n <= 0) e.amount = "Số lượng nhập phải lớn hơn 0.";
    } else if (reason === "DAMAGE") {
      if (n <= 0) e.amount = "Số lượng hư hỏng phải lớn hơn 0.";
    } else if (reason === "ADJUSTMENT") {
      if (n === 0) e.amount = "Thay đổi phải khác 0.";
    } else if (n < 0) {
      e.amount = "Tồn kho thực tế không được âm.";
    }
    if (!e.amount) {
      if (reason === "STOCKTAKE" ? n > MAX : Math.abs(n) > MAX) {
        e.amount = `Giá trị tối đa là ${MAX.toLocaleString("vi-VN")}.`;
      } else if (after !== null && after < 0) {
        e.amount = `Tồn kho không đủ để giảm (hiện còn ${item.stock}).`;
      }
    }
    const t = note.trim();
    if (noteRequired && !t) e.note = "Vui lòng nhập ghi chú.";
    else if (t.length > 255) e.note = "Ghi chú tối đa 255 ký tự.";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const found = validate();
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const n = Number(amount.trim());
    const body: AdjustInventoryInput = {
      variantId: item.variantId,
      reason,
      expectedStock: item.stock,
    };
    if (reason === "STOCKTAKE") body.newStock = n;
    else if (reason === "DAMAGE") body.change = -Math.abs(n);
    else body.change = n;
    if (note.trim()) body.note = note.trim();

    busyRef.current = true;
    setBusy(true);
    try {
      const result = await adjustInventory(body);
      onAdjusted(result.item, item.stock);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        const cur = (err.details as { currentStock?: unknown } | undefined)?.currentStock;
        if (typeof cur === "number") {
          if (cur !== item.stock) {
            setGeneral(`Tồn kho vừa thay đổi (hiện còn ${cur}). Vui lòng kiểm tra lại số liệu.`);
            setErrors({});
            onStockChanged(cur);
          } else {
            setGeneral(`Tồn kho không đủ để giảm (hiện còn ${cur}).`);
          }
        } else {
          setGeneral(err.message);
        }
      } else {
        const fe = fieldErrorsOf(err);
        const shown: Record<string, string> = {};
        const amountMsg = fe.change ?? fe.newStock;
        if (amountMsg) shown.amount = amountMsg;
        if (fe.note) shown.note = fe.note;
        setErrors(shown);
        setGeneral(Object.keys(shown).length > 0 ? null : adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminModal
      title="Điều chỉnh tồn kho"
      description={`${item.productName} · ${item.variantName} · SKU ${item.sku}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="adj-reason">Lý do</Label>
          <select
            id="adj-reason"
            data-autofocus
            className={selectClass}
            value={reason}
            disabled={busy}
            onChange={(e) => changeReason(e.target.value as AdjustReason)}
          >
            {ADJUST_REASONS.map((r) => (
              <option key={r} value={r}>
                {INVENTORY_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="adj-amount">{AMOUNT_LABEL[reason]}</Label>
          <Input
            id="adj-amount"
            type="number"
            inputMode={reason === "ADJUSTMENT" ? "text" : "numeric"}
            step={1}
            value={amount}
            invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "adj-amount-err" : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FieldError id="adj-amount-err">{errors.amount}</FieldError>
        </div>

        <dl
          className="grid grid-cols-2 gap-2 rounded-lg bg-cream-50 p-3 text-sm"
          aria-live="polite"
        >
          <dt className="text-coffee-700">Tồn hiện tại</dt>
          <dd className="text-right font-semibold text-coffee-900">{item.stock}</dd>
          <dt className="text-coffee-700">Tồn sau dự kiến</dt>
          <dd className="text-right font-semibold text-coffee-900">
            {after === null ? "—" : after}
          </dd>
        </dl>

        <div>
          <Label htmlFor="adj-note">
            {noteRequired ? "Ghi chú (bắt buộc)" : "Ghi chú (không bắt buộc)"}
          </Label>
          <textarea
            id="adj-note"
            rows={3}
            value={note}
            maxLength={255}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? "adj-note-err" : undefined}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
          />
          <FieldError id="adj-note-err">{errors.note}</FieldError>
        </div>

        <FormError>{general}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            Lưu điều chỉnh
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
