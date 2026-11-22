"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { orderErrorMessage } from "@/features/orders/labels";
import { formatDateTime, formatVND } from "@/lib/format";
import { claimBankTransfer, getBankTransfer, type BankTransferInfo } from "../api";

/**
 * Hướng dẫn chuyển khoản + mã VietQR (D-061). "Tôi đã chuyển khoản" chỉ ghi nhận khách báo;
 * đơn chỉ thành "đã thanh toán" khi nhân viên xác nhận đã nhận tiền.
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
    } catch {
      setState("failed");
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={copy} aria-label={`Sao chép ${label}`}>
        Sao chép
      </Button>
      <span role="status" className="text-xs text-coffee-700">
        {state === "done" ? "Đã sao chép" : state === "failed" ? "Không sao chép được" : ""}
      </span>
    </span>
  );
}

function Row({
  label,
  value,
  copy,
  testId,
}: {
  label: string;
  value: string;
  copy?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-coffee-100 py-2 last:border-0">
      <dt className="text-sm text-coffee-700">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-coffee-900">
        <span data-testid={testId} className="font-semibold break-all">
          {value}
        </span>
        {copy ? <CopyButton value={value} label={label.toLowerCase()} /> : null}
      </dd>
    </div>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "ready"; info: BankTransferInfo }
  | { kind: "error"; message: string };

export function BankTransferPanel({ code, phone }: { code: string; phone?: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getBankTransfer(code, phone).then(
      (info) => !cancelled && setLoad({ kind: "ready", info }),
      (err: unknown) => !cancelled && setLoad({ kind: "error", message: orderErrorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [code, phone, attempt]);

  async function claim() {
    if (lock.current || load.kind !== "ready") return;
    lock.current = true;
    setClaiming(true);
    setClaimError(null);
    try {
      const { claimedAt } = await claimBankTransfer(code, phone);
      setLoad({ kind: "ready", info: { ...load.info, claimedAt } });
    } catch (err) {
      setClaimError(orderErrorMessage(err));
    }
    lock.current = false;
    setClaiming(false);
  }

  if (load.kind === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Đang tải hướng dẫn chuyển khoản">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div
        role="alert"
        className="space-y-2 rounded-lg border border-danger-600/40 bg-danger-50 p-3"
      >
        <p className="text-sm text-danger-600">{load.message}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
          Thử lại
        </Button>
      </div>
    );
  }

  const { info } = load;
  return (
    <section
      aria-label="Hướng dẫn chuyển khoản"
      className="space-y-3 rounded-2xl border border-moss-200 bg-white p-4 text-left sm:p-5"
    >
      {info.isDemo ? (
        <div
          role="note"
          className="rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-2 text-danger-600"
        >
          <p className="font-bold">Tài khoản demo, KHÔNG chuyển tiền thật</p>
          <p className="text-sm">
            Mã QR và số tài khoản dưới đây chỉ để minh họa; ngân hàng không có tài khoản này.
          </p>
        </div>
      ) : null}
      <h2 className="font-serif text-lg font-bold text-coffee-900">Chuyển khoản ngân hàng</h2>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        {/* Ảnh data URL do backend dựng: CSP storefront đã cho phép img-src data: */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={info.qrDataUrl}
          alt={`Mã QR VietQR chuyển khoản ${formatVND(info.amount)} cho đơn ${info.orderCode}`}
          width={224}
          height={224}
          className="mx-auto h-56 w-56 rounded-lg border border-coffee-200 bg-white"
        />
        <dl>
          <Row label="Ngân hàng" value={info.bankName} />
          <Row label="Số tài khoản" value={info.accountNo} copy testId="bt-account" />
          <Row label="Chủ tài khoản" value={info.accountName} />
          <Row label="Số tiền" value={formatVND(info.amount)} />
          <Row label="Nội dung chuyển khoản" value={info.content} copy testId="bt-content" />
        </dl>
      </div>
      <p className="text-sm text-coffee-800">
        Giữ nguyên nội dung chuyển khoản để cửa hàng đối soát. Đơn được giữ tới{" "}
        <strong>{formatDateTime(info.expiresAt)}</strong>; quá hạn chưa nhận được tiền, đơn sẽ tự
        hủy.
      </p>
      {info.claimedAt ? (
        <p
          role="status"
          data-testid="bt-claimed"
          className="rounded-lg bg-moss-50 px-3 py-2 text-sm text-moss-800"
        >
          Đã ghi nhận bạn báo chuyển khoản lúc {formatDateTime(info.claimedAt)}. Đơn sẽ được xác
          nhận sau khi cửa hàng nhận được tiền.
        </p>
      ) : (
        <div className="space-y-2">
          <Button onClick={claim} loading={claiming}>
            Tôi đã chuyển khoản
          </Button>
          <p className="text-xs text-coffee-700">
            Bấm sau khi chuyển xong để báo cho cửa hàng. Việc này chưa đổi đơn sang đã thanh toán.
          </p>
        </div>
      )}
      {claimError ? (
        <p role="alert" className="text-sm text-danger-600">
          {claimError}
        </p>
      ) : null}
    </section>
  );
}
