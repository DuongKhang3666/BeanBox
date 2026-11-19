"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import * as wishlistApi from "./api";
import { wishlistErrorMessage } from "./messages";

export type ToggleResult = { ok: true; wished: boolean } | { ok: false };

export interface WishlistContextValue {
  /** Trạng thái đăng nhập (nút tim dùng để quyết định có chuyển sang trang đăng nhập không). */
  authStatus: "loading" | "authenticated" | "anonymous";
  isWished: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  /** Cập nhật lạc quan, hoàn tác khi lỗi (đồng thời hiện thông báo). */
  toggle: (productId: string) => Promise<ToggleResult>;
  /** Đánh dấu thêm các sản phẩm đã biết chắc là đang yêu thích (vd. trang /tai-khoan/yeu-thich). */
  seed: (productIds: string[]) => void;
}

const NOOP: WishlistContextValue = {
  authStatus: "anonymous",
  isWished: () => false,
  isPending: () => false,
  toggle: async () => ({ ok: false }),
  seed: () => {},
};

const WishlistContext = createContext<WishlistContextValue>(NOOP);

const NOTICE_MS = 5000;

/** Nạp /me/wishlist/ids một lần sau khi đăng nhập và chia sẻ cho mọi nút tim. */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const userId = status === "authenticated" ? (user?.id ?? "me") : null;
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const idsRef = useRef<ReadonlySet<string>>(ids);
  const pendingRef = useRef<Set<string>>(new Set());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: ReadonlySet<string>) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    if (userId === null) return;
    let active = true;
    wishlistApi.getWishlistIds().then(
      (list) => {
        // Hợp nhất với những gì đã biết (đã seed / vừa bấm) để không ghi đè trạng thái mới hơn.
        if (active) commit(new Set([...list, ...idsRef.current]));
      },
      () => {
        /* Không tải được: giữ trạng thái rỗng, bấm tim vẫn hoạt động. */
      },
    );
    return () => {
      active = false;
      // Đổi/đăng xuất tài khoản: bỏ trạng thái của người dùng trước.
      commit(new Set());
    };
  }, [userId, commit]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const toggle = useCallback(
    async (productId: string): Promise<ToggleResult> => {
      if (pendingRef.current.has(productId)) return { ok: false };
      const wasWished = idsRef.current.has(productId);
      const withItem = (on: boolean) => {
        const next = new Set(idsRef.current);
        if (on) next.add(productId);
        else next.delete(productId);
        return next;
      };
      pendingRef.current.add(productId);
      setPending(new Set(pendingRef.current));
      commit(withItem(!wasWished));
      try {
        if (wasWished) await wishlistApi.removeFromWishlist(productId);
        else await wishlistApi.addToWishlist(productId);
        return { ok: true, wished: !wasWished };
      } catch (err) {
        commit(withItem(wasWished));
        showNotice(wishlistErrorMessage(err));
        return { ok: false };
      } finally {
        pendingRef.current.delete(productId);
        setPending(new Set(pendingRef.current));
      }
    },
    [commit, showNotice],
  );

  const seed = useCallback(
    (productIds: string[]) => {
      if (productIds.every((id) => idsRef.current.has(id))) return;
      commit(new Set([...idsRef.current, ...productIds]));
    },
    [commit],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      authStatus: status,
      isWished: (id) => ids.has(id),
      isPending: (id) => pending.has(id),
      toggle,
      seed,
    }),
    [status, ids, pending, toggle, seed],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={
          notice
            ? "fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl bg-coffee-900 px-4 py-3 text-sm text-cream-50 shadow-lg"
            : "sr-only"
        }
      >
        {notice}
      </div>
    </WishlistContext.Provider>
  );
}

/** Ngoài <WishlistProvider> trả về giá trị mặc định (xem như chưa đăng nhập). */
export function useWishlist(): WishlistContextValue {
  return useContext(WishlistContext);
}
