"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsGranularity, AnalyticsOverview, AnalyticsKpis } from "@/types/admin";
import { getAnalyticsOverview } from "../api/analytics";
import {
  activePreset,
  analyticsHref,
  deltaPct,
  deltaPts,
  formatInt,
  formatRate,
  MIN_DATE,
  parseAnalyticsParams,
  PRESETS,
  presetRange,
  rangeLabel,
  shortDate,
  todayVn,
  validateRange,
  type Delta,
} from "../analyticsRange";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { AnalyticsChart, AnalyticsTable } from "./AnalyticsChart";

const card = "rounded-2xl border border-coffee-200 bg-white p-4";
const h2 = "font-serif text-lg font-bold text-coffee-900";

const GRANULARITIES: ReadonlyArray<{ id: AnalyticsGranularity; label: string }> = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
];
const GRAN_NOUN: Record<AnalyticsGranularity, string> = {
  day: "ngày",
  week: "tuần",
  month: "tháng",
};

/** key = `from|to|granularity` (chuỗi ổn định cho useResource). */
function load(key: string): Promise<AnalyticsOverview> {
  const [from, to, granularity] = key.split("|") as [string, string, AnalyticsGranularity];
  return getAnalyticsOverview({ from, to, granularity });
}

function Forbidden() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
    >
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Bạn không đủ quyền xem phân tích kinh doanh
      </h1>
      <p className="text-coffee-800">Chỉ quản trị viên mới xem được trang này.</p>
      <Link href="/admin" className={buttonClasses("primary")}>
        Về tổng quan
      </Link>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải phân tích" role="status" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** Dòng so sánh: không chỉ dùng màu (mũi tên + chữ + text cho trình đọc màn hình). */
function DeltaLine({
  delta,
  upIsBad,
  neutral,
  prevLabel,
}: {
  delta: Delta;
  upIsBad?: boolean;
  neutral?: boolean;
  prevLabel: string;
}) {
  if (delta.direction === "none") {
    return <p className="mt-1 text-sm text-coffee-700">{delta.visual}</p>;
  }
  const bad = delta.direction === "up" ? upIsBad : delta.direction === "down" ? !upIsBad : false;
  const tone =
    neutral || delta.direction === "flat"
      ? "text-coffee-800"
      : bad
        ? "text-danger-600"
        : "text-moss-800";
  return (
    <p className="mt-1 text-sm text-coffee-800">
      <span className={cn("font-semibold", tone)}>
        <span aria-hidden="true">{delta.visual}</span>
        <span className="sr-only">{delta.spoken}</span>
      </span>{" "}
      so với kỳ trước ({prevLabel})
    </p>
  );
}

function Kpi({
  label,
  value,
  delta,
  upIsBad,
  neutral,
  prevLabel,
}: {
  label: string;
  value: string;
  delta: Delta;
  upIsBad?: boolean;
  neutral?: boolean;
  prevLabel: string;
}) {
  return (
    <section aria-label={label} className={card}>
      <p className="text-sm text-coffee-700">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">{value}</p>
      <DeltaLine delta={delta} upIsBad={upIsBad} neutral={neutral} prevLabel={prevLabel} />
    </section>
  );
}

function KpiGrid({ kpis, prevLabel }: { kpis: AnalyticsKpis; prevLabel: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Kpi
        label="Doanh thu"
        value={formatVND(kpis.revenue.current)}
        delta={deltaPct(kpis.revenue)}
        prevLabel={prevLabel}
      />
      <Kpi
        label="Đơn đã thanh toán"
        value={formatInt(kpis.paidOrders.current)}
        delta={deltaPct(kpis.paidOrders)}
        prevLabel={prevLabel}
      />
      <Kpi
        label="Giá trị đơn trung bình"
        value={formatVND(kpis.aov.current)}
        delta={deltaPct(kpis.aov)}
        prevLabel={prevLabel}
      />
      <Kpi
        label="Đơn đã đặt"
        value={formatInt(kpis.ordersPlaced.current)}
        delta={deltaPct(kpis.ordersPlaced)}
        prevLabel={prevLabel}
      />
      <Kpi
        label="Đơn hủy"
        value={formatInt(kpis.cancelledOrders.current)}
        delta={deltaPct(kpis.cancelledOrders)}
        upIsBad
        prevLabel={prevLabel}
      />
      <Kpi
        label="Tỷ lệ hủy"
        value={formatRate(kpis.cancelRate.current)}
        delta={deltaPts(kpis.cancelRate)}
        upIsBad
        prevLabel={prevLabel}
      />
      <Kpi
        label="Giảm giá"
        value={formatVND(kpis.discountTotal.current)}
        delta={deltaPct(kpis.discountTotal)}
        neutral
        prevLabel={prevLabel}
      />
      <Kpi
        label="Hoàn tiền"
        value={formatVND(kpis.refundedAmount.current)}
        delta={deltaPct(kpis.refundedAmount)}
        upIsBad
        prevLabel={prevLabel}
      />
      <Kpi
        label="Khách mới"
        value={formatInt(kpis.newCustomers.current)}
        delta={deltaPct(kpis.newCustomers)}
        prevLabel={prevLabel}
      />
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    "inline-flex h-11 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600",
    active
      ? "border-moss-800 bg-moss-800 text-white"
      : "border-coffee-300 bg-white text-coffee-900 hover:bg-cream-100",
  );
}

/** Nhập khoảng ngày tùy chọn; `key` đổi theo URL nên state tự đặt lại khi chọn preset. */
function CustomRange({
  from,
  to,
  today,
  onApply,
}: {
  from: string;
  to: string;
  today: string;
  onApply: (from: string, to: string) => void;
}) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateRange(f, t, today);
    setError(err);
    if (!err) onApply(f, t);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <Label htmlFor="an-from">Từ ngày</Label>
        <Input
          id="an-from"
          type="date"
          value={f}
          min={MIN_DATE}
          max={today}
          onChange={(e) => setF(e.target.value)}
          invalid={Boolean(error)}
          aria-describedby={error ? "an-range-error" : undefined}
        />
      </div>
      <div>
        <Label htmlFor="an-to">Đến ngày</Label>
        <Input
          id="an-to"
          type="date"
          value={t}
          min={MIN_DATE}
          max={today}
          onChange={(e) => setT(e.target.value)}
          invalid={Boolean(error)}
          aria-describedby={error ? "an-range-error" : undefined}
        />
      </div>
      <Button type="submit" variant="outline">
        Áp dụng
      </Button>
      {error ? (
        <div className="w-full">
          <FieldError id="an-range-error">{error}</FieldError>
        </div>
      ) : null}
    </form>
  );
}

export function AdminAnalytics() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const today = useMemo(() => todayVn(), []);
  const sel = useMemo(
    () => parseAnalyticsParams(new URLSearchParams(paramsKey), today),
    [paramsKey, today],
  );
  const preset = activePreset(sel, today);

  // Chỉ gọi API khi là ADMIN; STAFF thấy thông báo (backend vẫn chặn 403).
  const res = useResource<AnalyticsOverview>(
    isAdmin ? `${sel.from}|${sel.to}|${sel.granularity}` : null,
    load,
  );

  if (user && !isAdmin) return <Forbidden />;

  const keepG = sel.explicitGranularity ? sel.granularity : undefined;
  const go = (range: { from: string; to: string }, g = keepG) =>
    router.replace(analyticsHref(range, g));

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <AnalyticsSkeleton />;
  else if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 403) return <Forbidden />;
    body = (
      <ErrorState
        title="Không tải được số liệu phân tích"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const prevLabel = rangeLabel(d.previousRange);
    const k = d.kpis;
    const empty =
      k.ordersPlaced.current === 0 && k.paidOrders.current === 0 && k.refundedAmount.current === 0;
    const noun = GRAN_NOUN[d.range.granularity];
    const summary = `Doanh thu theo ${noun}, ${rangeLabel(d.range)}: tổng ${formatVND(k.revenue.current)} từ ${formatInt(k.paidOrders.current)} đơn đã thanh toán; kỳ trước ${formatVND(k.revenue.previous)}.`;
    body = (
      <div className="space-y-4">
        {empty ? (
          <p className="rounded-lg bg-cream-100 px-3 py-2 text-sm text-coffee-800" role="status">
            Chưa có đơn hàng nào trong khoảng thời gian này; các chỉ số hiển thị 0.
          </p>
        ) : null}
        <KpiGrid kpis={k} prevLabel={prevLabel} />
        <section aria-labelledby="an-chart" className={card}>
          <h2 id="an-chart" className={`${h2} mb-3`}>
            Doanh thu theo {noun}
          </h2>
          <AnalyticsChart
            series={d.series}
            previousSeries={d.previousSeries}
            granularity={d.range.granularity}
            summary={summary}
          />
          <details className="mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-moss-800 underline underline-offset-2">
              Xem dạng bảng
            </summary>
            <div className="mt-2">
              <AnalyticsTable
                series={d.series}
                previousSeries={d.previousSeries}
                granularity={d.range.granularity}
                caption={`Doanh thu theo ${noun}, ${rangeLabel(d.range)} (${d.series.length} dòng)`}
              />
            </div>
          </details>
        </section>
        <p className="text-xs text-coffee-700">
          Doanh thu tính theo ngày thanh toán, chỉ gồm đơn đã thanh toán và chưa bị hủy hoặc hoàn
          trả. Đơn đã đặt tính theo ngày tạo đơn. Ngày theo giờ Việt Nam. Số liệu quá khứ có thể
          thay đổi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-coffee-900">Phân tích kinh doanh</h1>
          <p className="text-sm text-coffee-800">
            Từ {shortDate(sel.from, true)} đến {shortDate(sel.to, true)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {res.status === "ready" ? (
            <p className="text-sm text-coffee-700" aria-live="polite">
              Cập nhật lúc {formatVnDateTime(res.data!.generatedAt)}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={res.retry}
            loading={res.status === "loading"}
          >
            Làm mới
          </Button>
        </div>
      </div>

      <section aria-label="Bộ lọc" className={cn(card, "space-y-4")}>
        <div role="group" aria-label="Khoảng thời gian" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              className={chipClass(preset === p.id)}
              onClick={() => go(presetRange(p.id, today))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <CustomRange
          key={`${sel.from}|${sel.to}`}
          from={sel.from}
          to={sel.to}
          today={today}
          onApply={(f, t) => go({ from: f, to: t })}
        />
        <div role="group" aria-label="Nhóm theo" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-coffee-800">Nhóm theo:</span>
          {GRANULARITIES.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={sel.granularity === g.id}
              className={chipClass(sel.granularity === g.id)}
              onClick={() => go(sel, g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      {body}
    </div>
  );
}
