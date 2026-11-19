"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

function api(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

let loading: Promise<TurnstileApi> | null = null;

/** Tải script Turnstile một lần (chỉ gọi từ trang liên hệ khi captcha bật). Lỗi -> cho phép thử lại. */
function loadTurnstile(): Promise<TurnstileApi> {
  const existing = api();
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const t = api();
      if (t) resolve(t);
      else {
        s.remove();
        loading = null;
        reject(new Error("turnstile unavailable"));
      }
    };
    s.onerror = () => {
      s.remove();
      loading = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface Props {
  siteKey: string;
  /** Token mới, hoặc null khi token hết hạn/lỗi/được reset. */
  onToken: (token: string | null) => void;
  /** Script không tải được hoặc widget báo lỗi không phục hồi được. */
  onUnavailable: () => void;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { siteKey, onToken, onUnavailable },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cbs = useRef({ onToken, onUnavailable });
  useEffect(() => {
    cbs.current = { onToken, onUnavailable };
  });

  useImperativeHandle(ref, () => ({
    reset() {
      cbs.current.onToken(null);
      const t = api();
      if (t && widgetId.current !== null) t.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let id: string | null = null;
    loadTurnstile().then(
      (t) => {
        if (cancelled || !container.current) return;
        id = t.render(container.current, {
          sitekey: siteKey,
          language: "vi",
          callback: (token: string) => cbs.current.onToken(token),
          "expired-callback": () => cbs.current.onToken(null),
          "timeout-callback": () => cbs.current.onToken(null),
          "error-callback": () => {
            cbs.current.onToken(null);
            cbs.current.onUnavailable();
          },
        });
        widgetId.current = id;
      },
      () => {
        if (!cancelled) cbs.current.onUnavailable();
      },
    );
    return () => {
      cancelled = true;
      const t = api();
      if (t && id !== null) {
        try {
          t.remove(id);
        } catch {
          // widget đã bị gỡ
        }
      }
      widgetId.current = null;
    };
  }, [siteKey]);

  return <div ref={container} data-testid="turnstile-container" className="min-h-[65px]" />;
});
