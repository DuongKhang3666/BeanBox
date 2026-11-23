"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import type { ImportAction, ImportEntry, ImportPreview, ImportResult } from "@/types/admin";
import { commitProductImport, exportProductsCsv, previewProductImport } from "../api/products";
import { saveBlob } from "../download";
import { adminErrorMessage } from "../errors";
import { AdminModal } from "./AdminModal";

/** Khớp server (D-073): file tối đa 1 MB. */
export const IMPORT_MAX_BYTES = 1024 * 1024;

export const IMPORT_ACTION_LABEL: Record<ImportAction, string> = {
  create_product: "Tạo sản phẩm",
  create_variant: "Tạo biến thể",
  update_variant: "Cập nhật biến thể",
  update_product: "Cập nhật sản phẩm",
  unchanged: "Không thay đổi",
  error: "Lỗi",
};

const ACTION_ORDER: ImportAction[] = [
  "error",
  "create_product",
  "create_variant",
  "update_product",
  "update_variant",
  "unchanged",
];

const ACTION_TONE: Record<ImportAction, string> = {
  create_product: "bg-moss-50 text-moss-800",
  create_variant: "bg-moss-50 text-moss-800",
  update_product: "bg-cream-200 text-coffee-900",
  update_variant: "bg-cream-200 text-coffee-900",
  unchanged: "bg-coffee-100 text-coffee-800",
  error: "bg-danger-50 text-danger-600",
};

/** Số dòng xem trước hiển thị mỗi lần (tránh dựng hàng nghìn dòng DOM). */
const PAGE = 100;

/** Lỗi của API nhập -> câu tiếng Việt; các mã lỗi riêng dùng message của server (đã là tiếng Việt). */
export function importErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (
      ["INVALID_CSV", "PAYLOAD_TOO_LARGE", "FINGERPRINT_MISMATCH", "IMPORT_HAS_ERRORS"].includes(
        err.code,
      ) ||
      err.status === 409
    ) {
      return err.message;
    }
    if (err.status === 429) return "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.";
  }
  return adminErrorMessage(err);
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<ImportAction | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const busyRef = useRef(false);

  function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    setGeneral(null);
    setFileError(undefined);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) setFileError("Vui lòng chọn file có đuôi .csv.");
    else if (f.size === 0) setFileError("File trống.");
    else if (f.size > IMPORT_MAX_BYTES) setFileError("File vượt quá 1 MB.");
  }

  async function run<T>(fn: () => Promise<T>, ok: (v: T) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setGeneral(null);
    try {
      ok(await fn());
    } catch (e) {
      setGeneral(importErrorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const canPreview = file !== null && !fileError;

  const onPreview = () =>
    run(
      () => previewProductImport(file!, file!.name),
      (p) => {
        setPreview(p);
        setFilter(p.summary.error > 0 ? "error" : "all");
        setShown(PAGE);
      },
    );

  const onCommit = () =>
    run(
      () => commitProductImport(file!, file!.name, preview!.fingerprint),
      (r) => {
        setResult(r);
        onDone();
      },
    );

  let content: React.ReactNode;
  if (result) {
    const a = result.applied;
    content = (
      <div className="space-y-4">
        <p
          role="status"
          className="rounded-lg border border-moss-600/40 bg-moss-50 px-3 py-2 text-moss-800"
        >
          Đã áp dụng file {result.fileName}.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-coffee-900">
          <li>Sản phẩm mới: {a.productsCreated}</li>
          <li>Sản phẩm cập nhật: {a.productsUpdated}</li>
          <li>Biến thể mới: {a.variantsCreated}</li>
          <li>Biến thể cập nhật: {a.variantsUpdated}</li>
          <li>Điều chỉnh tồn kho: {a.stockMovements}</li>
          <li>Không thay đổi: {a.unchanged}</li>
        </ul>
        <div className="flex justify-end">
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    );
  } else if (preview) {
    const s = preview.summary;
    const entries: ImportEntry[] =
      filter === "all" ? preview.entries : preview.entries.filter((e) => e.action === filter);
    content = (
      <div className="space-y-4">
        <p className="text-sm text-coffee-800">
          File <span className="font-medium">{preview.fileName}</span>: {s.rows} dòng dữ liệu. Chưa
          có gì được ghi vào hệ thống.
        </p>
        <div role="group" aria-label="Lọc theo loại hành động" className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "secondary" : "outline"}
            aria-pressed={filter === "all"}
            onClick={() => {
              setFilter("all");
              setShown(PAGE);
            }}
          >
            {`Tất cả (${preview.entries.length})`}
          </Button>
          {ACTION_ORDER.filter((a) => s[a] > 0).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={filter === a ? "secondary" : "outline"}
              aria-pressed={filter === a}
              onClick={() => {
                setFilter(a);
                setShown(PAGE);
              }}
            >
              {`${IMPORT_ACTION_LABEL[a]} (${s[a]})`}
            </Button>
          ))}
        </div>

        {s.error > 0 ? (
          <p
            role="alert"
            className="rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-2 text-sm text-danger-600"
          >
            File còn {s.error} dòng lỗi. Hãy sửa file rồi chọn lại; chỉ áp dụng được khi không còn
            lỗi.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-coffee-200">
          <table className="w-full text-left text-sm text-coffee-900">
            <caption className="sr-only">Kết quả xem trước nhập CSV</caption>
            <thead className="bg-cream-50 text-coffee-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Dòng
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Hành động
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Sản phẩm / SKU
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coffee-100">
              {entries.slice(0, shown).map((e, i) => (
                <tr key={`${e.line}-${e.action}-${i}`} data-action={e.action}>
                  <td className="whitespace-nowrap px-3 py-2">{e.line}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        ACTION_TONE[e.action],
                      )}
                    >
                      {IMPORT_ACTION_LABEL[e.action]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block break-all">{e.productSlug ?? "—"}</span>
                    <span className="block break-all font-mono text-xs text-coffee-700">
                      {e.sku ?? ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {e.errors?.length ? (
                      <ul className="space-y-0.5 text-danger-600">
                        {e.errors.map((er) => (
                          <li key={er.field}>
                            <span className="font-mono text-xs">{er.field}</span>: {er.message}
                          </li>
                        ))}
                      </ul>
                    ) : e.changes?.length ? (
                      <span className="font-mono text-xs">{e.changes.join(", ")}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length > shown ? (
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            {`Hiện thêm (${entries.length - shown} dòng)`}
          </Button>
        ) : null}

        <FormError>{general}</FormError>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>
            Chọn file khác
          </Button>
          <Button onClick={onCommit} loading={busy} disabled={!preview.canApply}>
            Áp dụng
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <form
        noValidate
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (canPreview) void onPreview();
        }}
      >
        <p className="rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
          Dùng file đã xuất từ nút “Xuất CSV”. Hệ thống không đổi slug sản phẩm hay SKU, và không
          xóa sản phẩm/biến thể vắng mặt trong file. Bạn sẽ xem trước thay đổi rồi mới áp dụng.
        </p>
        <div>
          <Label htmlFor="imp-file">File CSV (UTF-8, tối đa 1 MB, 2000 dòng)</Label>
          <input
            id="imp-file"
            data-autofocus
            type="file"
            accept=".csv,text/csv"
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? "imp-file-err" : undefined}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="block w-full text-base text-coffee-900 file:mr-3 file:h-11 file:rounded-lg file:border file:border-coffee-700 file:bg-transparent file:px-4 file:text-coffee-800"
          />
          <FieldError id="imp-file-err">{fileError}</FieldError>
        </div>
        <FormError>{general}</FormError>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy} disabled={!canPreview}>
            Xem trước
          </Button>
        </div>
      </form>
    );
  }

  return (
    <AdminModal title="Nhập sản phẩm từ CSV" busy={busy} wide onClose={onClose}>
      {content}
    </AdminModal>
  );
}

/** Nút "Xuất CSV" / "Nhập CSV" cho danh sách sản phẩm (chỉ ADMIN, D-073). */
export function ProductCsvTools({ onImported }: { onImported: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (user?.role !== "ADMIN") return null;

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await exportProductsCsv();
      saveBlob(blob, filename);
    } catch (e) {
      if (mounted.current) setError(importErrorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" loading={busy} onClick={onExport}>
          Xuất CSV
        </Button>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Nhập CSV
        </Button>
      </div>
      {error ? (
        <p role="alert" className="max-w-xs text-sm text-danger-600">
          {error}
        </p>
      ) : null}
      {open ? <ImportDialog onClose={() => setOpen(false)} onDone={onImported} /> : null}
    </div>
  );
}
