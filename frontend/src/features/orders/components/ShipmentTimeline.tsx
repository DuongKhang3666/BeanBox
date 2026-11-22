"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import type { Shipment } from "@/types/order";

/**
 * Hành trình vận chuyển MÔ PHỎNG (D-062): mã vận đơn (sao chép được) + các mốc, mới nhất ở trên.
 * Không có hãng vận chuyển thật phía sau; luôn ghi rõ là giả lập.
 */
export function ShipmentTimeline({ shipment }: { shipment: Shipment }) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  async function onCopy() {
    if (!shipment.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(shipment.trackingNumber);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  }
  const rows = [...shipment.events].reverse();
  return (
    <section
      aria-labelledby="shipment-heading"
      className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <h2 id="shipment-heading" className="font-serif text-lg font-bold text-coffee-900">
        Hành trình vận chuyển
      </h2>
      <p className="text-sm text-coffee-700">
        Hành trình mô phỏng (giả lập), không phải dữ liệu từ hãng vận chuyển thật.
      </p>
      <dl className="grid gap-2 text-coffee-900 sm:grid-cols-2">
        {shipment.carrier ? (
          <div>
            <dt className="text-sm text-coffee-700">Đơn vị vận chuyển</dt>
            <dd>{shipment.carrier}</dd>
          </div>
        ) : null}
        {shipment.trackingNumber ? (
          <div>
            <dt className="text-sm text-coffee-700">Mã vận đơn</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{shipment.trackingNumber}</span>
              <Button variant="outline" size="sm" onClick={onCopy} aria-label="Sao chép mã vận đơn">
                Sao chép
              </Button>
              <span role="status" className="text-xs text-coffee-700">
                {copy === "done" ? "Đã sao chép" : copy === "failed" ? "Không sao chép được" : ""}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
      {rows.length === 0 ? (
        <p className="text-sm text-coffee-700">Chưa có cập nhật vận chuyển.</p>
      ) : (
        <ol
          aria-label="Hành trình vận chuyển (mô phỏng)"
          className="space-y-4 border-l-2 border-coffee-200 pl-4"
        >
          {rows.map((e, i) => (
            <li key={`${e.code}-${e.at}`} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${
                  i === 0 ? "bg-moss-700" : "bg-coffee-400"
                }`}
              />
              <p className={i === 0 ? "font-semibold text-coffee-900" : "text-coffee-800"}>
                {e.label}
              </p>
              <p className="text-sm text-coffee-700">
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
