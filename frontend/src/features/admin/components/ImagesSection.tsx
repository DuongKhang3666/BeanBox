"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { FormError } from "@/features/auth/components/FormError";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { ApiError } from "@/lib/api/errors";
import type { AdminImage, AdminProduct } from "@/types/admin";
import {
  addAdminImage,
  deleteAdminImage,
  reorderAdminImages,
  updateAdminImage,
  uploadAdminImage,
} from "../api/products";
import { adminErrorMessage, fieldErrorsOf } from "../errors";

export const MAX_IMAGES = 10;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Lỗi file phía client; undefined = hợp lệ. */
export function fileError(file: { type: string; size: number }): string | undefined {
  if (!UPLOAD_TYPES.includes(file.type)) return "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.";
  if (file.size > MAX_UPLOAD_BYTES) return "Ảnh vượt quá 5 MB, vui lòng chọn ảnh nhỏ hơn.";
  return undefined;
}

function imageErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
      return "Ảnh vượt quá 5 MB, vui lòng chọn ảnh nhỏ hơn.";
    }
    if (err.code === "CONFLICT") return err.message;
    if (err.code === "VALIDATION_ERROR") {
      const fe = fieldErrorsOf(err);
      return fe.file ?? fe.url ?? fe.alt ?? fe.imageIds ?? err.message;
    }
  }
  return adminErrorMessage(err);
}

function ImageCard({
  image,
  index,
  total,
  productName,
  readOnly,
  busy,
  onSaveAlt,
  onPrimary,
  onMove,
  onDelete,
}: {
  image: AdminImage;
  index: number;
  total: number;
  productName: string;
  readOnly: boolean;
  busy: boolean;
  onSaveAlt: (alt: string) => void;
  onPrimary: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const n = index + 1;
  const [alt, setAlt] = useState(image.alt ?? "");
  const dirty = alt.trim() !== (image.alt ?? "");
  return (
    <li className="space-y-3 rounded-xl border border-coffee-200 p-3">
      <div className="flex items-start gap-3">
        <ProductImage
          src={image.url}
          alt={image.alt}
          name={productName}
          sizes="96px"
          className="h-24 w-24 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1 space-y-2">
          {image.isPrimary ? (
            <span className="inline-flex rounded-full bg-moss-50 px-2 py-0.5 text-xs font-medium text-moss-800">
              Ảnh chính
            </span>
          ) : null}
          <Label htmlFor={`img-alt-${image.id}`} className="mb-1 text-xs">
            {`Mô tả ảnh ${n} (alt)`}
          </Label>
          <Input
            id={`img-alt-${image.id}`}
            value={alt}
            maxLength={200}
            disabled={readOnly || busy}
            onChange={(e) => setAlt(e.target.value)}
          />
        </div>
      </div>
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !dirty}
            aria-label={`Lưu mô tả ảnh ${n}`}
            onClick={() => onSaveAlt(alt.trim())}
          >
            Lưu mô tả
          </Button>
          {image.isPrimary ? null : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={`Đặt ảnh ${n} làm ảnh chính`}
              onClick={onPrimary}
            >
              Đặt làm ảnh chính
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || index === 0}
            aria-label={`Chuyển ảnh ${n} lên`}
            onClick={() => onMove(-1)}
          >
            <span aria-hidden="true">↑</span> Lên
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || index === total - 1}
            aria-label={`Chuyển ảnh ${n} xuống`}
            onClick={() => onMove(1)}
          >
            <span aria-hidden="true">↓</span> Xuống
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            aria-label={`Xóa ảnh ${n}`}
            onClick={onDelete}
          >
            Xóa
          </Button>
        </div>
      )}
    </li>
  );
}

/** Khối ảnh sản phẩm: upload, alt, ảnh chính, sắp xếp, xóa. */
export function ImagesSection({
  product,
  readOnly,
  onChange,
}: {
  product: AdminProduct;
  readOnly: boolean;
  onChange: (images: AdminImage[]) => void;
}) {
  const images = product.images;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [toDelete, setToDelete] = useState<AdminImage | null>(null);
  const busyRef = useRef(false);

  async function run(action: () => Promise<AdminImage[]>, success: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      onChange(await action());
      setNotice(success);
    } catch (err) {
      setError(imageErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || busyRef.current) return;
    const bad = fileError(file);
    if (bad) {
      setError(bad);
      setNotice("");
      return;
    }
    setUploading(true);
    await run(async () => {
      const uploaded = await uploadAdminImage(file);
      return addAdminImage(product.id, { url: uploaded.url });
    }, "Đã tải ảnh lên.");
    setUploading(false);
  }

  function move(index: number, dir: -1 | 1) {
    const ids = images.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => reorderAdminImages(product.id, ids), "Đã cập nhật thứ tự ảnh.");
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    await run(() => deleteAdminImage(product.id, target.id), "Đã xóa ảnh.");
    setToDelete(null);
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <section className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-serif text-lg font-bold text-coffee-900">Ảnh sản phẩm</h2>
        <p className="mt-1 text-sm text-coffee-700">
          {images.length}/{MAX_IMAGES} ảnh. Chấp nhận JPG, PNG, WebP, tối đa 5 MB mỗi ảnh.
        </p>
      </div>

      {readOnly || full ? (
        full && !readOnly ? (
          <p className="text-sm text-coffee-800">
            Đã đủ {MAX_IMAGES} ảnh. Xóa bớt ảnh để tải thêm.
          </p>
        ) : null
      ) : (
        <div>
          <Label htmlFor="img-upload">Tải ảnh lên</Label>
          <input
            id="img-upload"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={onFile}
            className="block w-full text-base text-coffee-900 file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-coffee-800 file:px-4 file:text-base file:font-medium file:text-cream-50"
          />
          {uploading ? (
            <p
              role="status"
              className="mt-2 inline-flex items-center gap-2 text-sm text-coffee-800"
            >
              <Spinner label="" /> Đang tải ảnh lên…
            </p>
          ) : null}
        </div>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {notice}
      </p>
      <FormError>{error}</FormError>

      {images.length === 0 ? (
        <p className="rounded-xl border border-dashed border-coffee-300 bg-cream-50 p-4 text-sm text-coffee-800">
          Chưa có ảnh nào. Ảnh đầu tiên sẽ tự động là ảnh chính.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {images.map((img, i) => (
            <ImageCard
              key={img.id}
              image={img}
              index={i}
              total={images.length}
              productName={product.name}
              readOnly={readOnly}
              busy={busy}
              onSaveAlt={(alt) =>
                run(
                  () => updateAdminImage(product.id, img.id, { alt }),
                  `Đã lưu mô tả ảnh ${i + 1}.`,
                )
              }
              onPrimary={() =>
                run(
                  () => updateAdminImage(product.id, img.id, { isPrimary: true }),
                  `Đã đặt ảnh ${i + 1} làm ảnh chính.`,
                )
              }
              onMove={(dir) => move(i, dir)}
              onDelete={() => setToDelete(img)}
            />
          ))}
        </ul>
      )}

      {toDelete ? (
        <ConfirmDialog
          title="Xóa ảnh"
          description="Xóa ảnh này khỏi sản phẩm? Nếu là ảnh chính, ảnh đầu tiên còn lại sẽ thành ảnh chính."
          confirmLabel="Xóa ảnh"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      ) : null}
    </section>
  );
}
