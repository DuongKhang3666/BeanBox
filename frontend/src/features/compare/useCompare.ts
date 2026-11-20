"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  addToCompare,
  clearCompare,
  COMPARE_MAX,
  getCompareSnapshot,
  getNoticeSnapshot,
  getServerCompareSnapshot,
  getServerNoticeSnapshot,
  removeFromCompare,
  subscribeCompare,
  subscribeNotice,
  type CompareEntry,
} from "./store";

export function useCompare() {
  const items = useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getServerCompareSnapshot,
  );
  const has = useCallback((slug: string) => items.some((e) => e.slug === slug), [items]);
  return {
    items,
    has,
    isFull: items.length >= COMPARE_MAX,
    add: (entry: CompareEntry) => addToCompare(entry),
    remove: (slug: string) => removeFromCompare(slug),
    clear: () => clearCompare(),
  };
}

export function useCompareNotice(): string {
  return useSyncExternalStore(subscribeNotice, getNoticeSnapshot, getServerNoticeSnapshot);
}

/** false khi SSR và lúc hydrate, true sau đó (tránh nhấp nháy trạng thái rỗng khi đọc localStorage). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
