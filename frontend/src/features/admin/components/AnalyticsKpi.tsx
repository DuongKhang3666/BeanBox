import { cn } from "@/lib/cn";
import type { Delta } from "../analyticsRange";
import { card } from "./AnalyticsBreakdown";

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

export function Kpi({
  label,
  value,
  delta,
  upIsBad,
  neutral,
  prevLabel,
  note,
}: {
  label: string;
  value: string;
  delta: Delta;
  upIsBad?: boolean;
  neutral?: boolean;
  prevLabel: string;
  /** Dòng phụ dưới số chính (ví dụ "12 / 40 đơn"). */
  note?: string;
}) {
  return (
    <section aria-label={label} className={card}>
      <p className="text-sm text-coffee-700">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">{value}</p>
      {note ? <p className="mt-1 text-sm text-coffee-800">{note}</p> : null}
      <DeltaLine delta={delta} upIsBad={upIsBad} neutral={neutral} prevLabel={prevLabel} />
    </section>
  );
}
