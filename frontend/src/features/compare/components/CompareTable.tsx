"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { BREW_LABELS, PROCESS_LABELS, ROAST_LABELS, STOCK_LABELS } from "@/features/catalog/labels";
import { formatVND } from "@/lib/format";
import type { CompareItem, StockStatus } from "@/types/catalog";

const DASH = "—";

interface Row {
  id: string;
  label: string;
  /** Chuỗi chuẩn hóa để so sánh các cột; rỗng = thiếu dữ liệu. */
  text: (p: CompareItem) => string;
  /** Cách hiển thị; mặc định là `text` hoặc "—". */
  node?: (p: CompareItem) => ReactNode;
}

interface Group {
  id: string;
  title: string | null;
  rows: Row[];
}

function stockOf(p: CompareItem): StockStatus {
  if (!p.inStock) return "OUT_OF_STOCK";
  return p.variants.length > 0 && p.variants.every((v) => v.stockStatus === "LOW_STOCK")
    ? "LOW_STOCK"
    : "IN_STOCK";
}

function priceText(p: CompareItem): string {
  const { min, max } = p.priceRange;
  return min === max ? formatVND(min) : `${formatVND(min)} – ${formatVND(max)}`;
}

const weight = (g: number | null) => (g && g > 0 ? `${g.toLocaleString("vi-VN")} g` : "");

/** Tên biến thể thường đã có khối lượng ("250 g - Nguyên hạt"): chỉ thêm khi chưa có để khỏi lặp. */
function extraWeight(name: string, g: number | null): string {
  if (!g || g <= 0) return "";
  const compact = name.toLowerCase().replace(/\s+/g, "");
  return compact.includes(`${g}g`) ? "" : weight(g);
}

const GROUPS: Group[] = [
  {
    id: "general",
    title: null,
    rows: [
      {
        id: "price",
        label: "Giá",
        text: (p) => `${priceText(p)}|${p.compareAtPrice ?? ""}`,
        node: (p) => (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={
                p.compareAtPrice ? "font-semibold text-danger-600" : "font-semibold text-coffee-900"
              }
            >
              {priceText(p)}
            </span>
            {p.compareAtPrice ? (
              <>
                <span className="sr-only">Giá gốc</span>
                <del className="text-xs text-coffee-600">{formatVND(p.compareAtPrice)}</del>
              </>
            ) : null}
          </span>
        ),
      },
      { id: "stock", label: "Tình trạng", text: (p) => STOCK_LABELS[stockOf(p)] },
      {
        id: "rating",
        label: "Đánh giá",
        text: (p) =>
          p.ratingCount > 0
            ? `${p.ratingAvg.toFixed(1)} trên 5 (${p.ratingCount} đánh giá)`
            : "Chưa có đánh giá",
        node: (p) =>
          p.ratingCount > 0 ? (
            <span>
              <span aria-hidden="true" className="text-amber-600">
                ★{" "}
              </span>
              {p.ratingAvg.toFixed(1)} trên 5 ({p.ratingCount} đánh giá)
            </span>
          ) : (
            "Chưa có đánh giá"
          ),
      },
      { id: "brand", label: "Thương hiệu", text: (p) => p.brand?.name ?? "" },
      { id: "category", label: "Danh mục", text: (p) => p.category.name },
      {
        id: "variants",
        label: "Biến thể",
        text: (p) => p.variants.map((v) => `${v.name}|${weight(v.weightGram)}`).join(";"),
        node: (p) => (
          <ul className="space-y-1">
            {p.variants.map((v, i) => (
              <li key={`${v.name}-${i}`}>
                {v.name}
                {extraWeight(v.name, v.weightGram) ? (
                  <span className="text-coffee-600"> · {extraWeight(v.name, v.weightGram)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ),
      },
    ],
  },
  {
    id: "coffee",
    title: "Thông tin cà phê",
    rows: [
      { id: "origin", label: "Xuất xứ", text: (p) => p.coffee?.originCountry ?? "" },
      { id: "region", label: "Vùng", text: (p) => p.coffee?.originRegion ?? "" },
      { id: "variety", label: "Giống", text: (p) => p.coffee?.variety ?? "" },
      {
        id: "process",
        label: "Sơ chế",
        text: (p) => (p.coffee?.process ? PROCESS_LABELS[p.coffee.process] : ""),
      },
      {
        id: "roast",
        label: "Mức rang",
        text: (p) => (p.coffee?.roastLevel ? ROAST_LABELS[p.coffee.roastLevel] : ""),
      },
      {
        id: "altitude",
        label: "Độ cao",
        text: (p) =>
          p.coffee?.altitude != null ? `${p.coffee.altitude.toLocaleString("vi-VN")} m` : "",
      },
      {
        id: "notes",
        label: "Hương vị",
        text: (p) => [...(p.coffee?.tastingNotes ?? [])].sort().join(", "),
        node: (p) => (
          <ul className="flex flex-wrap gap-1.5">
            {(p.coffee?.tastingNotes ?? []).map((n) => (
              <li
                key={n}
                className="rounded-full bg-moss-100 px-2 py-0.5 text-xs font-medium text-moss-800"
              >
                {n}
              </li>
            ))}
          </ul>
        ),
      },
      {
        id: "brew",
        label: "Cách pha",
        text: (p) =>
          [...(p.coffee?.brewMethods ?? [])]
            .sort()
            .map((m) => BREW_LABELS[m])
            .join(", "),
      },
    ],
  },
];

function rowDiffers(row: Row, items: CompareItem[]): boolean {
  const first = row.text(items[0]!);
  return items.some((p) => row.text(p) !== first);
}

interface Props {
  items: CompareItem[];
  onlyDifferences: boolean;
  onRemove: (slug: string) => void;
}

export function CompareTable({ items, onlyDifferences, onRemove }: Props) {
  const hasCoffee = items.some((p) => p.coffee !== null);
  const groups = GROUPS.filter((g) => g.id !== "coffee" || hasCoffee)
    .map((g) => ({
      ...g,
      rows: onlyDifferences ? g.rows.filter((r) => rowDiffers(r, items)) : g.rows,
    }))
    .filter((g) => g.rows.length > 0);

  const cell = "border-b border-coffee-200 px-3 py-3 align-top text-sm text-coffee-900";
  const rowHead = `${cell} sticky left-0 z-10 w-28 min-w-28 bg-cream-50 text-left font-medium text-coffee-700 sm:w-36 sm:min-w-36`;

  return (
    <>
      <div
        tabIndex={0}
        role="region"
        aria-label="Bảng so sánh sản phẩm (cuộn ngang để xem thêm)"
        className="relative overflow-x-auto rounded-xl border border-coffee-200 bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600"
      >
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">
            So sánh {items.length} sản phẩm: {items.map((p) => p.name).join(", ")}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-28 min-w-28 bg-cream-50 sm:w-36 sm:min-w-36"
              >
                <span className="sr-only">Thông số</span>
              </th>
              {items.map((p) => (
                <th
                  key={p.slug}
                  scope="col"
                  className="min-w-40 border-b border-l border-coffee-200 px-3 py-3 text-left align-top font-normal"
                >
                  <div className="w-24">
                    <ProductImage
                      src={p.primaryImage?.url}
                      alt={p.primaryImage?.alt}
                      name={p.name}
                      sizes="96px"
                      className="w-full rounded-lg"
                    />
                  </div>
                  <Link
                    href={`/san-pham/${p.slug}`}
                    className="mt-2 block text-sm font-semibold text-coffee-900 underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600"
                  >
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onRemove(p.slug)}
                    aria-label={`Bỏ khỏi so sánh: ${p.name}`}
                    className="mt-2 inline-flex min-h-8 items-center rounded-md border border-coffee-300 px-2.5 text-xs font-medium text-coffee-800 hover:bg-coffee-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600"
                  >
                    Bỏ khỏi so sánh
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              {g.title ? (
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={items.length + 1}
                    className="border-b border-coffee-200 bg-coffee-50 px-3 py-2 text-left text-sm font-semibold text-coffee-900"
                  >
                    {g.title}
                  </th>
                </tr>
              ) : null}
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className={rowHead}>
                    {r.label}
                  </th>
                  {items.map((p) => {
                    const empty = r.text(p) === "";
                    return (
                      <td key={p.slug} className={`${cell} border-l`}>
                        {empty ? (
                          <>
                            <span aria-hidden="true">{DASH}</span>
                            <span className="sr-only">Không có thông tin</span>
                          </>
                        ) : r.node ? (
                          r.node(p)
                        ) : (
                          r.text(p)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {onlyDifferences && groups.length === 0 ? (
        <p className="mt-3 text-sm text-coffee-700">
          Các sản phẩm giống nhau ở mọi thông số đang so sánh.
        </p>
      ) : null}
    </>
  );
}
