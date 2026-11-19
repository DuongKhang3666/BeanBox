"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Debounce ô lọc/tìm kiếm của bảng admin rồi gọi `commit` (thường là router.replace).
 *
 * Lỗi cũ: người dùng gõ rồi bấm ngay link trong bảng; trong lúc chuyển trang chưa xong (trang cũ
 * vẫn mounted) timer 400 ms kích hoạt router.replace về danh sách và ghi đè lượt điều hướng. Vì vậy
 * khi có click vào link nội bộ ta hủy timer đang chờ và tạm dừng debounce tới khi query string
 * đổi (điều hướng cùng trang xong) hoặc người dùng gõ tiếp; điều hướng sang route khác thì
 * component unmount và effect tự dọn.
 *
 * `shouldSkip(trimmed)` cho phép bỏ qua giá trị chưa hợp lệ (ví dụ 1 ký tự).
 */
export function useDebouncedUrlInput(
  input: string,
  current: string,
  commit: (value: string | undefined) => void,
  shouldSkip?: (trimmed: string) => boolean,
  delayMs = 400,
) {
  const navKey = useSearchParams().toString();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suspendedAt = useRef<string | null>(null);
  const lastInput = useRef(input);
  const latest = useRef({ commit, shouldSkip, navKey });
  useEffect(() => {
    latest.current = { commit, shouldSkip, navKey };
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (a.origin !== window.location.origin) return;
      clearTimeout(timer.current);
      suspendedAt.current = latest.current.navKey;
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (input !== lastInput.current) {
      lastInput.current = input;
      suspendedAt.current = null; // người dùng gõ tiếp: bật lại
    }
    if (suspendedAt.current === navKey) return;
    const t = input.trim();
    if (t === current || shouldSkip?.(t)) return;
    timer.current = setTimeout(() => latest.current.commit(t || undefined), delayMs);
    return () => clearTimeout(timer.current);
    // shouldSkip chỉ phụ thuộc vào t; giữ ngoài deps để không reset timer mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, current, navKey, delayMs]);
}
