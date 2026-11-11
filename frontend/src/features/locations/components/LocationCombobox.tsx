"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FieldError, Label } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { matchesQuery } from "@/lib/text";
import type { LocationOption } from "@/types/location";

export interface LocationComboboxProps {
  /** Bằng tên field để focusFirstInvalid hoạt động. */
  id: string;
  label: string;
  options: LocationOption[];
  /** Mã đang chọn hoặc "". */
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  placeholder?: string;
  /** Tên hiển thị khi `value` chưa có trong `options` (đang tải). */
  displayName?: string;
}

/** Combobox WAI-ARIA (list autocomplete) với lọc không dấu. */
export function LocationCombobox({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
  loading,
  error,
  placeholder,
  displayName,
}: LocationComboboxProps) {
  const listId = `${id}-listbox`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  /** null = không đang gõ (hiển thị tên đã chọn, danh sách đầy đủ). */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedName = options.find((o) => o.code === value)?.name ?? displayName ?? "";
  const filtered = useMemo(
    () => (query === null ? options : options.filter((o) => matchesQuery(o.name, query))),
    [options, query],
  );
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));
  const activeOption = open ? filtered[activeIndex] : undefined;
  const isDisabled = !!disabled || !!loading;

  useEffect(() => {
    if (!open || !activeOption) return;
    const el = document.getElementById(`${id}-opt-${activeOption.code}`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeOption, id]);

  function openList() {
    if (open) return;
    const idx = options.findIndex((o) => o.code === value);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function select(code: string) {
    onChange(code);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive(filtered.length ? (activeIndex + 1) % filtered.length : 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive(filtered.length ? (activeIndex - 1 + filtered.length) % filtered.length : 0);
        break;
      case "Enter":
        if (open) {
          e.preventDefault(); // không submit form khi đang chọn
          if (activeOption) select(activeOption.code);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <div className="relative">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${id}-opt-${activeOption.code}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-required="true"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={isDisabled}
          placeholder={placeholder}
          value={query ?? selectedName}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onClick={openList}
          onBlur={close}
          onKeyDown={onKeyDown}
          className={cn(
            "h-11 w-full rounded-lg border bg-white px-3 pr-10 text-base text-coffee-900",
            "placeholder:text-coffee-600/70 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600",
            "disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70",
            error ? "border-danger-600" : "border-coffee-400",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-coffee-700">
          {loading ? (
            <Spinner label="" />
          ) : (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M5.5 7.5 10 12l4.5-4.5-1.1-1.1L10 9.8 6.6 6.4z" />
            </svg>
          )}
        </span>
      </div>
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={label}
        hidden={!open}
        className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-coffee-300 bg-white py-1 shadow-lg"
      >
        {open && filtered.length === 0 ? (
          <li role="presentation" className="min-h-11 px-3 py-2.5 text-sm text-coffee-700">
            Không tìm thấy kết quả
          </li>
        ) : null}
        {open
          ? filtered.map((o, i) => {
              const selected = o.code === value;
              return (
                <li
                  key={o.code}
                  id={`${id}-opt-${o.code}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => {
                    e.preventDefault(); // giữ focus ở input, tránh blur đóng list trước khi chọn
                    select(o.code);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center px-3 py-2 text-base text-coffee-900",
                    i === activeIndex && "bg-moss-100",
                    selected && "font-semibold",
                  )}
                >
                  {o.name}
                </li>
              );
            })
          : null}
      </ul>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
