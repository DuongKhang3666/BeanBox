"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AnalyticsInventory, AnalyticsInventoryItem, SlowDays } from "@/types/admin";
import { getAnalyticsInventory } from "../api/analytics";
import { formatInt } from "../analyticsRange";
import { adminErrorMessage } from "../errors";
import { formatVnDate } from "../format";
import {
  BlockSkeleton,
  card,
  chip,
  EmptyNote,
  h2,
  TableScroll,
  TD_NUM,
  TH,
  TH_NUM,
} from "./AnalyticsBreakdown";
import { ExportCsvButton } from "./ExportCsvButton";

const linkClass =
  "font-medium text-moss-800 underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600";

export const SLOW_DAYS_OPTIONS: ReadonlyArray<SlowDays> = [30, 60, 90];
type Tab = "outOfStock" | "lowStock" | "slowMovers";
const TAB_LABEL: Record<Tab, string> = {
  outOfStock: "Hết hàng",
  lowStock: "Sắp hết",
  slowMovers: "Bán chậm",
};

/** key = `slowDays|refresh`. */
function load(key: string): Promise<AnalyticsInventory> {
  const [slowDays] = key.split("|") as [string];
  return getAnalyticsInventory({ slowDays: Number(slowDays) });
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <section aria-label={label} className="rounded-xl border border-coffee-200 bg-cream-50 p-3">
      <p className="text-sm text-coffee-700">{label}</p>
      <p className="mt-1 font-serif text-xl font-bold break-words text-coffee-900">{value}</p>
      {note ? <p className="mt-1 text-xs text-coffee-700">{note}</p> : null}
    </section>
  );
}

function ItemsTable({
  items,
  caption,
  total,
  label,
}: {
  items: AnalyticsInventoryItem[];
  caption: string;
  total: number;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <TableScroll label={label}>
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <caption className="px-3 py-2 text-left text-sm text-coffee-800">{caption}</caption>
          <thead className="bg-cream-100">
            <tr>
              <th scope="col" className={TH}>
                Sản phẩm
              </th>
              <th scope="col" className={TH_NUM}>
                Tồn
              </th>
              <th scope="col" className={TH_NUM}>
                Ngưỡng báo
              </th>
              <th scope="col" className={TH_NUM}>
                Giá niêm yết
              </th>
              <th scope="col" className={TH_NUM}>
                Giá trị tồn
              </th>
              <th scope="col" className={TH_NUM}>
                Giá trị theo giá vốn
              </th>
              <th scope="col" className={TH}>
                Bán gần nhất
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-100">
            {items.map((i) => (
              <tr key={i.variantId}>
                <th scope="row" className="min-w-0 px-3 py-2 text-left font-normal">
                  <Link
                    href={`/admin/san-pham/${i.productId}`}
                    className={cn(linkClass, "break-words")}
                  >
                    {i.productName}
                  </Link>
                  <span className="block text-xs break-words text-coffee-700">
                    {i.variantName} · {i.sku}
                  </span>
                </th>
                <td className={TD_NUM}>{formatInt(i.stock)}</td>
                <td className={TD_NUM}>{formatInt(i.lowStockThreshold)}</td>
                <td className={TD_NUM}>{formatVND(i.price)}</td>
                <td className={TD_NUM}>{formatVND(i.stockValue)}</td>
                <td className={TD_NUM}>
                  {i.stockCostValue === null ? "Chưa có" : formatVND(i.stockCostValue)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {i.lastSoldAt ? formatVnDate(i.lastSoldAt) : "Chưa từng bán"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {total > items.length ? (
        <p className="text-xs text-coffee-700">
          Hiển thị {formatInt(items.length)} trên {formatInt(total)} biến thể.
        </p>
      ) : null}
    </div>
  );
}

export function InventoryBlock({ refresh }: { refresh: number }) {
  const [slowDays, setSlowDays] = useState<SlowDays>(30);
  const [tab, setTab] = useState<Tab>("outOfStock");
  const res = useResource<AnalyticsInventory>(`${slowDays}|${refresh}`, load);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải số liệu tồn kho" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được số liệu tồn kho"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else {
    const d = res.data!;
    const s = d.summary;
    const tabs: Array<{ id: Tab; label: string; count: number; items: AnalyticsInventoryItem[] }> =
      [
        { id: "outOfStock", label: "Hết hàng", count: s.outOfStock, items: d.outOfStock },
        { id: "lowStock", label: "Sắp hết", count: s.lowStock, items: d.lowStock },
        { id: "slowMovers", label: "Bán chậm", count: s.slowMovers, items: d.slowMovers },
      ];
    const cur = tabs.find((t) => t.id === tab)!;
    const empty: Record<Tab, string> = {
      outOfStock: "Không có biến thể nào hết hàng.",
      lowStock: "Không có biến thể nào sắp hết hàng.",
      slowMovers: `Không có biến thể nào còn hàng mà không bán được trong ${d.slowDays} ngày gần nhất.`,
    };
    const captions: Record<Tab, string> = {
      outOfStock: "Biến thể hết hàng, sắp theo tên sản phẩm",
      lowStock: "Biến thể sắp hết hàng (còn từ 1 đến ngưỡng báo), tồn ít nhất trước",
      slowMovers: `Biến thể còn hàng, không bán được trong ${d.slowDays} ngày gần nhất, giá trị tồn lớn nhất trước`,
    };
    body = (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Biến thể đang bán" value={formatInt(s.variants)} />
          <Stat label="Hết hàng" value={formatInt(s.outOfStock)} />
          <Stat label="Sắp hết hàng" value={formatInt(s.lowStock)} />
          <Stat label="Tổng số lượng tồn" value={formatInt(s.stockUnits)} />
          <Stat
            label="Giá trị tồn kho"
            value={formatVND(s.stockValue)}
            note="Tồn x giá niêm yết, chỉ biến thể còn hàng"
          />
          <Stat
            label="Giá trị tồn theo giá vốn"
            value={formatVND(s.stockCostValue)}
            note={
              s.variantsWithoutCost > 0
                ? `Tồn x giá vốn bình quân; chưa tính ${formatInt(s.variantsWithoutCost)} biến thể còn hàng chưa có giá vốn`
                : "Tồn x giá vốn bình quân"
            }
          />
          <Stat
            label={`Bán chậm (${d.slowDays} ngày)`}
            value={`${formatInt(s.slowMovers)} biến thể`}
            note={`Giá trị tồn ${formatVND(s.slowMoversValue)}`}
          />
        </div>

        <div
          role="group"
          aria-label="Danh sách tồn kho"
          className="flex flex-wrap gap-2 print:hidden"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              className={chip(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({formatInt(t.count)})
            </button>
          ))}
        </div>

        {tab === "slowMovers" ? (
          <div
            role="group"
            aria-label="Số ngày không bán"
            className="flex flex-wrap gap-2 print:hidden"
          >
            <span className="inline-flex h-11 items-center text-sm text-coffee-800">
              Không bán trong:
            </span>
            {SLOW_DAYS_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={slowDays === n}
                className={chip(slowDays === n)}
                onClick={() => setSlowDays(n)}
              >
                {n} ngày
              </button>
            ))}
          </div>
        ) : null}

        {cur.items.length === 0 ? (
          <EmptyNote>{empty[tab]}</EmptyNote>
        ) : (
          <ItemsTable
            items={cur.items}
            caption={captions[tab]}
            total={cur.count}
            label={`Bảng ${cur.label.toLowerCase()}`}
          />
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-coffee-700">
          <li>
            Chỉ tính biến thể đang bán và chưa xóa. Hết hàng: tồn từ 0 trở xuống; sắp hết: còn từ 1
            đến ngưỡng báo của biến thể.
          </li>
          <li>
            Bán chậm: còn hàng nhưng không có đơn (trừ đơn hủy và đơn chờ thanh toán) nào trong{" "}
            {d.slowDays} ngày gần nhất; biến thể mới tạo trong khoảng đó được bỏ qua.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <section aria-labelledby="an-inventory" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="an-inventory" tabIndex={-1} className={h2}>
            Tồn kho
          </h2>
          <p className="text-sm text-coffee-800">Số liệu hiện tại, không theo khoảng ngày.</p>
        </div>
        <ExportCsvButton
          params={{
            report: "inventory",
            list: tab,
            ...(tab === "slowMovers" ? { slowDays } : {}),
          }}
          context={`tồn kho: ${TAB_LABEL[tab].toLowerCase()}`}
        />
      </div>
      {body}
    </section>
  );
}
