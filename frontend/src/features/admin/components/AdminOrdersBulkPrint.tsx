"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import { PRINT_MAX_CODES, printAdminOrders } from "../api/orders";
import { adminErrorMessage } from "../errors";
import { OrderPrintSheet } from "./AdminOrderPrint";

/** `?codes=A,B,A` -> mã đã trim, bỏ rỗng, bỏ trùng, giữ thứ tự. */
export function parsePrintCodes(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  ];
}

const load = (key: string) => printAdminOrders(JSON.parse(key) as string[]);

function BackLink() {
  return (
    <Link href="/admin/don-hang" className="text-sm font-medium text-moss-700 underline">
      ← Quay lại danh sách đơn hàng
    </Link>
  );
}

/**
 * D-072: in nhiều phiếu giao hàng cùng lúc, mỗi đơn một trang giấy. Chỉ đọc dữ liệu (1 request),
 * không đổi trạng thái đơn. Thanh điều khiển bị ẩn khi in.
 */
export function AdminOrdersBulkPrint() {
  const params = useSearchParams();
  const codes = parsePrintCodes(params.get("codes"));
  const tooMany = codes.length > PRINT_MAX_CODES;
  const key = codes.length > 0 && !tooMany ? JSON.stringify(codes) : null;
  const res = useResource(key, load);

  if (codes.length === 0 || tooMany) {
    return (
      <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
        <h1 className="font-serif text-xl font-bold text-coffee-900">
          {tooMany ? "Chọn quá nhiều đơn để in" : "Chưa chọn đơn nào để in"}
        </h1>
        <p className="text-coffee-800">
          {tooMany
            ? `Chỉ in tối đa ${PRINT_MAX_CODES} đơn mỗi lần (đang chọn ${codes.length}).`
            : "Hãy chọn các đơn ở danh sách rồi bấm “In phiếu”."}
        </p>
        <Link href="/admin/don-hang" className={buttonClasses("primary")}>
          Về danh sách đơn hàng
        </Link>
      </div>
    );
  }

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải phiếu giao" role="status" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    return (
      <ErrorState
        title="Không tải được phiếu giao"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }

  const { orders, missing } = res.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink />
        <Button onClick={() => window.print()} disabled={orders.length === 0}>
          {`In ${orders.length} phiếu`}
        </Button>
      </div>

      {missing.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-2 text-sm text-danger-600 print:hidden"
        >
          Không tìm thấy {missing.length} đơn: {missing.join(", ")}.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="text-coffee-800 print:hidden">Không có phiếu nào để in.</p>
      ) : (
        <div className="space-y-4 print:space-y-0">
          {orders.map((o, i) => (
            <OrderPrintSheet
              key={o.code}
              order={o}
              className={i < orders.length - 1 ? "print:break-after-page" : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
