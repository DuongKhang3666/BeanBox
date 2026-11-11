"use client";

import { useEffect, useState } from "react";

/** Thời gian còn lại (ms) tới `expiresAt`; null nếu không có hạn. Cập nhật mỗi giây. */
export function useRemainingMs(expiresAt: string | null | undefined): number | null {
  const target = expiresAt ? Date.parse(expiresAt) : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  return Number.isNaN(target) ? null : Math.max(0, target - now);
}

/** mm:ss (làm tròn lên theo giây). */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Chỉ thông báo cho trình đọc màn hình khi gần hết hạn, không đọc mỗi giây. */
export const WARN_BEFORE_MS = 60_000;
