"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";
import { adminErrorMessage } from "../errors";
import { exportAnalyticsCsv, type ExportParams } from "../api/analytics";
import { saveBlob } from "../download";

/** Lỗi xuất CSV -> câu tiếng Việt (429 kèm số giây chờ). */
export function exportErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    const d = err.details as { retryAfterSec?: unknown } | undefined;
    const n = typeof d?.retryAfterSec === "number" ? Math.max(1, Math.ceil(d.retryAfterSec)) : null;
    return n
      ? `Bạn xuất quá nhanh, thử lại sau ${n} giây.`
      : "Bạn xuất quá nhanh, thử lại sau ít phút.";
  }
  if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
    return "Không xuất được với bộ lọc hiện tại. Vui lòng kiểm tra lại khoảng ngày.";
  }
  return adminErrorMessage(err);
}

/**
 * Nút "Xuất CSV" cho một khối phân tích (api-contract §16.4). `context` bổ sung ngữ cảnh cho
 * trình đọc màn hình ("Xuất CSV top khách hàng"). Đang xuất: disabled + `aria-busy`.
 */
export function ExportCsvButton({ params, context }: { params: ExportParams; context: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const errId = `export-err-${context.replace(/\s+/g, "-")}`;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await exportAnalyticsCsv(params);
      saveBlob(blob, filename);
    } catch (e) {
      if (mounted.current) setError(exportErrorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start sm:items-end">
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        onClick={run}
        aria-label={`Xuất CSV ${context}`}
        aria-describedby={error ? errId : undefined}
        className="min-h-11"
      >
        Xuất CSV
      </Button>
      {error ? (
        <p id={errId} role="alert" className="mt-1 max-w-xs text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
