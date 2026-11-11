"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import type { Quote, QuoteRequest } from "@/types/order";
import { quote as fetchQuote } from "../orders/api";

export const QUOTE_DEBOUNCE_MS = 300;

interface State {
  key: string;
  quote?: Quote;
  error?: unknown;
}

export type QuoteStatus = "none" | "loading" | "ready" | "error";

/**
 * Gọi POST /checkout/quote khi `request` hoặc `cartSig` đổi (debounce 300 ms).
 * Kết quả chỉ được dùng nếu khớp key hiện tại -> kết quả cũ về muộn bị bỏ, và trong lúc tính lại
 * không bao giờ hiển thị tổng tiền của lần tính trước.
 */
export function useQuote(request: QuoteRequest | null, cartSig: string, onCartEmpty: () => void) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const key = request ? JSON.stringify([request, cartSig, attempt]) : null;

  const emptyCb = useRef(onCartEmpty);
  useEffect(() => {
    emptyCb.current = onCartEmpty;
  });

  useEffect(() => {
    if (key === null) return;
    const req = (JSON.parse(key) as [QuoteRequest])[0];
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchQuote(req, controller.signal).then(
        (q) => {
          if (!cancelled) setState({ key, quote: q });
        },
        (error) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.code === "CART_EMPTY") emptyCb.current();
          setState({ key, error });
        },
      );
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const current = state && state.key === key ? state : null;
  let status: QuoteStatus = "loading";
  if (key === null) status = "none";
  else if (current) status = current.error !== undefined ? "error" : "ready";

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  /** Thay quote hiện tại (vd. `details.quote` của PRICE_CHANGED). */
  const replace = useCallback(
    (q: Quote) => {
      if (key !== null) setState({ key, quote: q });
    },
    [key],
  );

  return {
    status,
    quote: status === "ready" ? current?.quote : undefined,
    error: status === "error" ? current?.error : undefined,
    retry,
    replace,
  };
}
