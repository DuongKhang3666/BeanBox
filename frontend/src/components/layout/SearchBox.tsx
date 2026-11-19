"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { api } from "@/lib/api/client";
import { formatVND } from "@/lib/format";
import type { SuggestResult } from "@/types/catalog";

export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 250;
const SUGGEST_LIMIT = 6;

type Status = "idle" | "loading" | "ready";

interface Option {
  id: string;
  href: string;
  kind: "product" | "category";
  name: string;
  imageUrl?: string | null;
  minPrice?: number;
}

function toOptions(result: SuggestResult | null, baseId: string): Option[] {
  if (!result) return [];
  const products: Option[] = result.products.map((p) => ({
    id: "",
    kind: "product",
    href: `/san-pham/${p.slug}`,
    name: p.name,
    imageUrl: p.imageUrl,
    minPrice: p.minPrice,
  }));
  const categories: Option[] = result.categories.map((c) => ({
    id: "",
    kind: "category",
    href: `/danh-muc/${c.slug}`,
    name: c.name,
  }));
  return [...products, ...categories].map((o, i) => ({ ...o, id: `${baseId}-opt-${i}` }));
}

/** Ô tìm kiếm header với gợi ý (combobox ARIA, FR-CAT-06). */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const rootRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [active, setActive] = useState(-1);

  const options = useMemo(() => toOptions(result, baseId), [result, baseId]);
  const products = options.filter((o) => o.kind === "product");
  const categories = options.filter((o) => o.kind === "category");

  const cancelPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function schedule(raw: string) {
    cancelPending();
    const q = raw.trim();
    setActive(-1);
    if (q.length < SUGGEST_MIN_CHARS) {
      setStatus("idle");
      setResult(null);
      return;
    }
    setStatus("loading");
    setResult(null);
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await api.get<SuggestResult>("/search/suggest", {
          query: { q, limit: SUGGEST_LIMIT },
          signal: controller.signal,
          skipAuth: true,
        });
        if (controller.signal.aborted) return;
        setResult(res.data);
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        // Lỗi mạng/máy chủ: ẩn dropdown, không báo lỗi.
        setStatus("idle");
        setResult(null);
        setOpen(false);
      }
    }, SUGGEST_DEBOUNCE_MS);
  }

  function go(href: string) {
    cancelPending();
    setOpen(false);
    setStatus("idle");
    setActive(-1);
    router.push(href);
  }

  function submit() {
    const chosen = active >= 0 ? options[active] : undefined;
    if (chosen) return go(chosen.href);
    const q = value.trim();
    if (q) go(`/tim-kiem?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (options.length === 0) return;
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const n = options.length;
        const down = e.key === "ArrowDown";
        setActive((cur) => (cur === -1 ? (down ? 0 : n - 1) : (cur + (down ? 1 : -1) + n) % n));
        return;
      }
      case "Enter":
        e.preventDefault();
        submit();
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        return;
    }
  }

  const showPopup = open && status !== "idle";
  const showList = showPopup && status === "ready" && options.length > 0;
  const activeId = showList && active >= 0 ? options[active]?.id : undefined;

  function renderOption(o: Option) {
    const idx = options.indexOf(o);
    return (
      <div
        key={o.id}
        id={o.id}
        role="option"
        aria-selected={idx === active}
        // mousedown giữ focus ở ô nhập; click mới điều hướng.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => go(o.href)}
        onMouseMove={() => setActive(idx)}
        className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-coffee-900 ${
          idx === active ? "bg-moss-50" : ""
        }`}
      >
        {o.kind === "product" ? (
          <>
            <ProductImage
              src={o.imageUrl}
              name={o.name}
              sizes="40px"
              className="h-10 w-10 shrink-0 rounded-md"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{o.name}</span>
              <span className="block text-xs text-coffee-700">{formatVND(o.minPrice ?? 0)}</span>
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">{o.name}</span>
        )}
      </div>
    );
  }

  return (
    <form
      ref={rootRef}
      action="/tim-kiem"
      method="get"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`relative ${className ?? ""}`}
    >
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Tìm kiếm sản phẩm
      </label>
      <input
        id={`${baseId}-input`}
        name="q"
        type="search"
        role="combobox"
        aria-expanded={showPopup}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Tìm hạt cà phê, phin, bình pha..."
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          schedule(e.target.value);
        }}
        onFocus={() => {
          if (status !== "idle") setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-sm text-coffee-900 placeholder:text-coffee-600/70"
      />

      {showPopup ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-coffee-200 bg-white shadow-lg">
          {status === "loading" ? (
            <p role="status" className="px-3 py-3 text-sm text-coffee-700">
              Đang tìm gợi ý...
            </p>
          ) : null}
          {status === "ready" && options.length === 0 ? (
            <p role="status" className="px-3 py-3 text-sm text-coffee-700">
              Không có gợi ý
            </p>
          ) : null}
          <div id={listboxId} role="listbox" aria-label="Gợi ý tìm kiếm" hidden={!showList}>
            {products.length > 0 ? (
              <div role="group" aria-labelledby={`${baseId}-g-p`}>
                <div
                  id={`${baseId}-g-p`}
                  className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-coffee-600"
                >
                  Sản phẩm
                </div>
                {products.map(renderOption)}
              </div>
            ) : null}
            {categories.length > 0 ? (
              <div role="group" aria-labelledby={`${baseId}-g-c`}>
                <div
                  id={`${baseId}-g-c`}
                  className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-coffee-600"
                >
                  Danh mục
                </div>
                {categories.map(renderOption)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
