"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type {
  AnalyticsTopCustomers,
  AnalyticsTopProducts,
  TopCustomersSort,
  TopProductsSort,
} from "@/types/admin";
import { getAnalyticsTopCustomers, getAnalyticsTopProducts } from "../api/analytics";
import { formatInt, rangeLabel } from "../analyticsRange";
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

function loadProducts(key: string): Promise<AnalyticsTopProducts> {
  const [sort, from, to] = key.split("|") as [TopProductsSort, string, string];
  return getAnalyticsTopProducts({ from, to, sort });
}
function loadCustomers(key: string): Promise<AnalyticsTopCustomers> {
  const [sort, from, to] = key.split("|") as [TopCustomersSort, string, string];
  return getAnalyticsTopCustomers({ from, to, sort });
}

interface Range {
  from: string;
  to: string;
  refresh: number;
}

export function TopProductsBlock({ from, to, refresh }: Range) {
  const [sort, setSort] = useState<TopProductsSort>("revenue");
  const res = useResource<AnalyticsTopProducts>(`${sort}|${from}|${to}|${refresh}`, loadProducts);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải top sản phẩm" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được top sản phẩm"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.items.length === 0) {
    body = <EmptyNote>Chưa có sản phẩm nào được bán trong khoảng thời gian này.</EmptyNote>;
  } else {
    const d = res.data!;
    body = (
      <TableScroll label="Bảng top sản phẩm">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="px-3 py-2 text-left text-sm text-coffee-800">
            Top {d.items.length} sản phẩm theo {sort === "revenue" ? "doanh thu" : "số lượng bán"},{" "}
            {rangeLabel(d.range)}
          </caption>
          <thead className="bg-cream-100">
            <tr>
              <th scope="col" className={TH_NUM}>
                #
              </th>
              <th scope="col" className={TH}>
                Sản phẩm
              </th>
              <th scope="col" className={TH_NUM}>
                Doanh thu
              </th>
              <th scope="col" className={TH_NUM}>
                Số lượng
              </th>
              <th scope="col" className={TH_NUM}>
                Số đơn
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-100">
            {d.items.map((p, i) => (
              <tr key={p.productId}>
                <td className={TD_NUM}>{i + 1}</td>
                <th scope="row" className="min-w-0 px-3 py-2 text-left font-normal">
                  {p.deleted ? (
                    <span className="font-medium break-words text-coffee-900">{p.name}</span>
                  ) : (
                    <Link
                      href={`/admin/san-pham/${p.productId}`}
                      className={cn(linkClass, "break-words")}
                    >
                      {p.name}
                    </Link>
                  )}
                  {p.deleted ? (
                    <span className="ml-2 rounded bg-coffee-100 px-1.5 py-0.5 text-xs text-coffee-800">
                      Đã xóa
                    </span>
                  ) : null}
                  {p.categoryName ? (
                    <span className="block text-xs break-words text-coffee-700">
                      {p.categoryName}
                    </span>
                  ) : null}
                </th>
                <td className={TD_NUM}>{formatVND(p.revenue)}</td>
                <td className={TD_NUM}>{formatInt(p.quantity)}</td>
                <td className={TD_NUM}>{formatInt(p.orders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    );
  }

  return (
    <section aria-labelledby="an-top-products" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-top-products" tabIndex={-1} className={h2}>
          Top sản phẩm
        </h2>
        <ExportCsvButton
          params={{ report: "top-products", from, to, sort }}
          context="top sản phẩm"
        />
      </div>
      <div
        role="group"
        aria-label="Sắp xếp top sản phẩm"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {(
          [
            ["revenue", "Theo doanh thu"],
            ["quantity", "Theo số lượng"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            className={chip(sort === id)}
            onClick={() => setSort(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
      <p className="text-xs text-coffee-700">
        Doanh thu là giá trị hàng hóa của các dòng trong đơn đã thanh toán, chưa trừ giảm giá cấp
        đơn. Sản phẩm đã xóa vẫn được tính.
      </p>
    </section>
  );
}

export function TopCustomersBlock({ from, to, refresh }: Range) {
  const [sort, setSort] = useState<TopCustomersSort>("revenue");
  const res = useResource<AnalyticsTopCustomers>(`${sort}|${from}|${to}|${refresh}`, loadCustomers);

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") {
    body = <BlockSkeleton label="Đang tải top khách hàng" />;
  } else if (res.status === "error") {
    body = (
      <ErrorState
        headingLevel={3}
        title="Không tải được top khách hàng"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.items.length === 0) {
    body = <EmptyNote>Chưa có khách hàng nào mua trong khoảng thời gian này.</EmptyNote>;
  } else {
    const d = res.data!;
    body = (
      <TableScroll label="Bảng top khách hàng">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="px-3 py-2 text-left text-sm text-coffee-800">
            Top {d.items.length} khách hàng theo {sort === "revenue" ? "doanh thu" : "số đơn"},{" "}
            {rangeLabel(d.range)}
          </caption>
          <thead className="bg-cream-100">
            <tr>
              <th scope="col" className={TH_NUM}>
                #
              </th>
              <th scope="col" className={TH}>
                Khách hàng
              </th>
              <th scope="col" className={TH_NUM}>
                Số đơn
              </th>
              <th scope="col" className={TH_NUM}>
                Doanh thu
              </th>
              <th scope="col" className={TH_NUM}>
                Giá trị đơn TB
              </th>
              <th scope="col" className={TH}>
                Mua gần nhất
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coffee-100">
            {d.items.map((c, i) => (
              <tr key={c.userId ?? `g:${c.email}`}>
                <td className={TD_NUM}>{i + 1}</td>
                <th scope="row" className="min-w-0 px-3 py-2 text-left font-normal">
                  {c.customerType === "registered" && c.userId ? (
                    <Link
                      href={`/admin/nguoi-dung/${c.userId}`}
                      className={cn(linkClass, "break-words")}
                    >
                      {c.name}
                    </Link>
                  ) : (
                    <span className="font-medium break-words text-coffee-900">{c.name}</span>
                  )}
                  {c.customerType === "guest" ? (
                    <span className="ml-2 rounded bg-cream-100 px-1.5 py-0.5 text-xs text-coffee-800">
                      Vãng lai
                    </span>
                  ) : null}
                  <span className="block text-xs break-all text-coffee-700">{c.email}</span>
                </th>
                <td className={TD_NUM}>{formatInt(c.orders)}</td>
                <td className={TD_NUM}>{formatVND(c.revenue)}</td>
                <td className={TD_NUM}>{formatVND(c.aov)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {c.lastPaidAt ? formatVnDate(c.lastPaidAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    );
  }

  return (
    <section aria-labelledby="an-top-customers" className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="an-top-customers" tabIndex={-1} className={h2}>
          Top khách hàng
        </h2>
        <ExportCsvButton
          params={{ report: "top-customers", from, to, sort }}
          context="top khách hàng"
        />
      </div>
      <div
        role="group"
        aria-label="Sắp xếp top khách hàng"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {(
          [
            ["revenue", "Theo doanh thu"],
            ["orders", "Theo số đơn"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            className={chip(sort === id)}
            onClick={() => setSort(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
      <p className="text-xs text-coffee-700">
        Khách có tài khoản gộp theo tài khoản; khách vãng lai gộp theo email (không phân biệt hoa
        thường). Một người vừa có tài khoản vừa từng mua vãng lai bằng cùng email sẽ hiện thành hai
        dòng. Doanh thu theo giá trị đơn.
      </p>
    </section>
  );
}
