import { formatDateTime } from "@/lib/format";
import type { OrderHistoryEntry } from "@/types/order";
import { orderStatusLabel } from "../labels";

/** Lịch sử trạng thái, mới nhất ở trên. */
export function OrderTimeline({ history }: { history: OrderHistoryEntry[] }) {
  if (history.length === 0) return null;
  const rows = [...history].reverse();
  return (
    <ol aria-label="Lịch sử đơn hàng" className="space-y-4 border-l-2 border-coffee-200 pl-4">
      {rows.map((h, i) => (
        <li key={`${h.createdAt}-${h.toStatus}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${
              i === 0 ? "bg-moss-700" : "bg-coffee-400"
            }`}
          />
          <p className={i === 0 ? "font-semibold text-coffee-900" : "text-coffee-800"}>
            {orderStatusLabel(h.toStatus)}
          </p>
          <p className="text-sm text-coffee-700">{formatDateTime(h.createdAt)}</p>
          {h.note ? <p className="text-sm text-coffee-700">{h.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
