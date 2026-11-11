"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type {
  AdminBrand,
  AdminCategory,
  AdminProductListItem,
  AdminProductQuery,
  AdminProductSort,
  AdminProductStatus,
} from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import { listAdminBrands, listAdminCategories } from "../api/catalog";
import { listAdminProducts } from "../api/products";
import { adminErrorMessage } from "../errors";
import { formatVnDate } from "../format";
import { PRODUCT_STATUS_LABEL } from "../labels";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import {
  ALL_PRODUCT_STATUSES,
  PRODUCTS_BASE,
  parseProductFilters,
  productsHref,
} from "../productFilters";
import { AdminPager } from "./AdminPager";
import { categoryOptions } from "./categoryOptions";

type Loaded = { data: AdminProductListItem[]; meta: PaginationMeta };

const load = (key: string) =>
  listAdminProducts({ ...(JSON.parse(key) as AdminProductQuery), pageSize: ADMIN_PAGE_SIZE });
const loadCategories = () => listAdminCategories();
const loadBrands = () => listAdminBrands();

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const STATUS_TONE: Record<AdminProductStatus, string> = {
  ACTIVE: "bg-moss-50 text-moss-800",
  DRAFT: "bg-cream-200 text-coffee-900",
  ARCHIVED: "bg-coffee-100 text-coffee-800",
};

export function ProductStatusBadge({ status }: { status: AdminProductStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        STATUS_TONE[status],
      )}
    >
      {PRODUCT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải sản phẩm" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

function NameCell({ item }: { item: AdminProductListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductImage
        src={item.primaryImageUrl}
        name={item.name}
        sizes="48px"
        className="h-12 w-12 shrink-0 rounded-lg"
      />
      <div className="min-w-0">
        <Link
          href={`${PRODUCTS_BASE}/${item.id}`}
          className="font-medium text-coffee-900 underline-offset-2 hover:underline"
        >
          {item.name}
        </Link>
        <p className="font-mono text-xs break-all text-coffee-700">{item.slug}</p>
      </div>
    </div>
  );
}

const price = (it: AdminProductListItem) =>
  it.variantCount > 0 && it.minPrice ? formatVND(it.minPrice) : "—";

const th = "px-3 py-3 font-medium";

function ProductTable({ items }: { items: AdminProductListItem[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Danh sách sản phẩm</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Sản phẩm
            </th>
            <th scope="col" className={th}>
              Danh mục
            </th>
            <th scope="col" className={th}>
              Thương hiệu
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Giá thấp nhất
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Biến thể
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Tồn
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
            <th scope="col" className={th}>
              Nổi bật
            </th>
            <th scope="col" className={th}>
              Cập nhật
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-3">
                <NameCell item={it} />
              </td>
              <td className="px-3 py-3">{it.category.name}</td>
              <td className="px-3 py-3">{it.brand?.name ?? "—"}</td>
              <td className="px-3 py-3 text-right">{price(it)}</td>
              <td className="px-3 py-3 text-right">{it.variantCount}</td>
              <td className="px-3 py-3 text-right">
                {it.totalStock}
                {!it.inStock ? <p className="text-xs text-danger-600">Hết hàng</p> : null}
              </td>
              <td className="px-3 py-3">
                <ProductStatusBadge status={it.status} />
              </td>
              <td className="px-3 py-3">{it.isFeatured ? "Nổi bật" : "—"}</td>
              <td className="px-3 py-3 whitespace-nowrap">{formatVnDate(it.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductCards({ items }: { items: AdminProductListItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((it) => (
        <li key={it.id} className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4">
          <NameCell item={it} />
          <div className="flex flex-wrap items-center gap-2">
            <ProductStatusBadge status={it.status} />
            {it.isFeatured ? (
              <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs">Nổi bật</span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-coffee-700">Danh mục</dt>
            <dd>{it.category.name}</dd>
            <dt className="text-coffee-700">Thương hiệu</dt>
            <dd>{it.brand?.name ?? "—"}</dd>
            <dt className="text-coffee-700">Giá thấp nhất</dt>
            <dd>{price(it)}</dd>
            <dt className="text-coffee-700">Biến thể</dt>
            <dd>{it.variantCount}</dd>
            <dt className="text-coffee-700">Tổng tồn</dt>
            <dd>
              {it.totalStock}
              {!it.inStock ? " (hết hàng)" : ""}
            </dd>
            <dt className="text-coffee-700">Cập nhật</dt>
            <dd>{formatVnDate(it.updatedAt)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function AdminProducts() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseProductFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);

  // Debounce ô tìm kiếm -> URL.
  useEffect(() => {
    const t = qInput.trim();
    if (t === urlQ) return;
    const id = setTimeout(() => {
      router.replace(productsHref({ ...filters, q: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, urlQ, filters, router]);

  const res = useResource<Loaded>(JSON.stringify(filters), load);
  const cats = useResource<AdminCategory[]>("categories", loadCategories);
  const brands = useResource<AdminBrand[]>("brands", loadBrands);
  const catOptions = cats.data ? categoryOptions(cats.data) : [];

  function apply(patch: Partial<AdminProductQuery>) {
    router.replace(productsHref({ ...filters, ...patch, page: undefined }));
  }

  function toggleStatus(s: AdminProductStatus) {
    const cur = new Set(filters.status ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    const next = ALL_PRODUCT_STATUSES.filter((v) => cur.has(v));
    apply({ status: next.length ? next : undefined });
  }

  const deleted = Boolean(filters.deleted);
  const filtered = Object.keys(filters).some((k) => k !== "page" && k !== "deleted");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được sản phẩm"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title={deleted ? "Không có sản phẩm đã xóa" : "Không có sản phẩm nào"}
        description={
          filtered
            ? "Không có sản phẩm nào khớp bộ lọc hiện tại."
            : deleted
              ? "Chưa có sản phẩm nào bị xóa."
              : "Thêm sản phẩm đầu tiên để bắt đầu bán hàng."
        }
        action={
          filtered ? (
            <Link
              href={productsHref({ deleted: deleted || undefined })}
              className={buttonClasses("outline")}
            >
              Xóa bộ lọc
            </Link>
          ) : !deleted ? (
            <Link href={`${PRODUCTS_BASE}/moi`} className={buttonClasses("primary")}>
              Thêm sản phẩm đầu tiên
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} sản phẩm</p>
        <ProductTable items={data} />
        <ProductCards items={data} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => productsHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Sản phẩm</h1>
        <Link href={`${PRODUCTS_BASE}/moi`} className={buttonClasses("primary")}>
          Thêm sản phẩm
        </Link>
      </div>

      <div role="group" aria-label="Phạm vi danh sách" className="flex gap-2">
        <Button
          size="sm"
          variant={deleted ? "outline" : "secondary"}
          aria-pressed={!deleted}
          onClick={() => apply({ deleted: undefined })}
        >
          Đang quản lý
        </Button>
        <Button
          size="sm"
          variant={deleted ? "secondary" : "outline"}
          aria-pressed={deleted}
          onClick={() => apply({ deleted: true })}
        >
          Đã xóa
        </Button>
      </div>

      <form
        role="search"
        aria-label="Bộ lọc sản phẩm"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="prd-q">Tìm theo tên hoặc slug</Label>
          <Input
            id="prd-q"
            type="search"
            value={qInput}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="mb-1.5 text-sm font-medium text-coffee-900">Trạng thái</legend>
          <div className="flex flex-wrap gap-2">
            {ALL_PRODUCT_STATUSES.map((s) => {
              const checked = filters.status?.includes(s) ?? false;
              return (
                <label
                  key={s}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
                    checked
                      ? "border-coffee-800 bg-coffee-800 text-cream-50"
                      : "border-coffee-300 bg-white text-coffee-800",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-moss-700"
                    checked={checked}
                    onChange={() => toggleStatus(s)}
                  />
                  {PRODUCT_STATUS_LABEL[s]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="prd-cat">Danh mục</Label>
          <select
            id="prd-cat"
            className={selectClass}
            value={filters.categoryId ?? ""}
            onChange={(e) => apply({ categoryId: e.target.value || undefined })}
          >
            <option value="">Tất cả danh mục</option>
            {catOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="prd-brand">Thương hiệu</Label>
          <select
            id="prd-brand"
            className={selectClass}
            value={filters.brandId ?? ""}
            onChange={(e) => apply({ brandId: e.target.value || undefined })}
          >
            <option value="">Tất cả thương hiệu</option>
            {(brands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="prd-sort">Sắp xếp</Label>
          <select
            id="prd-sort"
            className={selectClass}
            value={filters.sort ?? "newest"}
            onChange={(e) =>
              apply({
                sort:
                  e.target.value === "newest" ? undefined : (e.target.value as AdminProductSort),
              })
            }
          >
            <option value="newest">Mới nhất</option>
            <option value="updated">Mới cập nhật</option>
            <option value="name">Tên A-Z</option>
          </select>
        </div>
      </form>

      {body}
    </div>
  );
}
