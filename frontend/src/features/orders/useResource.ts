"use client";

import { useCallback, useEffect, useState } from "react";

interface Loaded<T> {
  key: string;
  attempt: number;
  data?: T;
  error?: unknown;
  failed: boolean;
}

export type ResourceStatus = "idle" | "loading" | "error" | "ready";

/**
 * Tải dữ liệu theo `key` (null = chưa tải). Kết quả của key cũ về muộn bị bỏ qua.
 * `load` phải ổn định (hàm module-level). `setData` cập nhật tại chỗ (vd. sau khi hủy đơn).
 */
export function useResource<T>(key: string | null, load: (key: string) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load(key).then(
      (data) => !cancelled && setLoaded({ key, attempt, data, failed: false }),
      (error) => !cancelled && setLoaded({ key, attempt, error, failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt, load]);

  const current = loaded && loaded.key === key && loaded.attempt === attempt ? loaded : null;
  let status: ResourceStatus = "loading";
  if (key === null) status = "idle";
  else if (current) status = current.failed ? "error" : "ready";

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const setData = useCallback(
    (data: T) => {
      if (key !== null) setLoaded({ key, attempt, data, failed: false });
    },
    [key, attempt],
  );

  return {
    status,
    data: status === "ready" ? (current?.data as T) : undefined,
    error: status === "error" ? current?.error : undefined,
    retry,
    setData,
  };
}
