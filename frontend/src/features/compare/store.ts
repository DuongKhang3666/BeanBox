// Danh sách so sánh sản phẩm lưu ở localStorage (D-047): không cần đăng nhập, không có bảng DB.
// Dữ liệu trong store chỉ để hiển thị thanh so sánh; trang /so-sanh luôn lấy dữ liệu mới từ API.

export const COMPARE_KEY = "bb_compare_v1";
export const COMPARE_MAX = 4;
export const COMPARE_FULL_MESSAGE = "Chỉ so sánh tối đa 4 sản phẩm";

export interface CompareEntry {
  slug: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mảng rỗng dùng chung: snapshot server và khi dữ liệu hỏng (tham chiếu ổn định cho useSyncExternalStore). */
export const EMPTY_COMPARE: readonly CompareEntry[] = Object.freeze([]);

/**
 * Chỉ nhận đường dẫn nội bộ: URL ngoài (do sửa tay localStorage) làm next/image ném lỗi host
 * chưa cấu hình và vỡ layout gốc, vì CompareBar nằm trong root layout. Cả đường đọc lẫn đường
 * ghi (addToCompare) đều đi qua sanitizeEntry nên hai phía nhất quán.
 */
function sanitizeImageUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2000) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return v;
}

function sanitizeEntry(raw: unknown): CompareEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== "string" || r.slug.length > 200 || !SLUG_RE.test(r.slug)) return null;
  if (typeof r.name !== "string" || r.name.trim() === "" || r.name.length > 300) return null;
  const imageUrl = sanitizeImageUrl(r.imageUrl);
  const categoryName =
    typeof r.categoryName === "string" && r.categoryName.length <= 200 ? r.categoryName : null;
  return { slug: r.slug, name: r.name, imageUrl, categoryName };
}

/** Parse an toàn: dữ liệu hỏng -> rỗng; phần tử sai bị bỏ; trùng slug bỏ; tối đa COMPARE_MAX. */
export function parseCompare(raw: string | null): readonly CompareEntry[] {
  if (!raw) return EMPTY_COMPARE;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_COMPARE;
  }
  if (!Array.isArray(json)) return EMPTY_COMPARE;
  const out: CompareEntry[] = [];
  for (const item of json) {
    const e = sanitizeEntry(item);
    if (e && !out.some((x) => x.slug === e.slug)) out.push(e);
    if (out.length >= COMPARE_MAX) break;
  }
  return out.length === 0 ? EMPTY_COMPARE : out;
}

function readRaw(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(COMPARE_KEY);
  } catch {
    return null;
  }
}

let cachedRaw: string | null = null;
let cached: readonly CompareEntry[] = EMPTY_COMPARE;
// Khi localStorage không dùng được (chế độ riêng tư...), giữ danh sách trong bộ nhớ của tab.
let memoryOnly: readonly CompareEntry[] | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Snapshot ổn định: chỉ tạo mảng mới khi chuỗi lưu trữ thay đổi. */
export function getCompareSnapshot(): readonly CompareEntry[] {
  if (memoryOnly) return memoryOnly;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseCompare(raw);
  }
  return cached;
}

export const getServerCompareSnapshot = (): readonly CompareEntry[] => EMPTY_COMPARE;

function write(next: readonly CompareEntry[]) {
  try {
    if (next.length === 0) window.localStorage.removeItem(COMPARE_KEY);
    else window.localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    memoryOnly = null;
  } catch {
    memoryOnly = next.length === 0 ? null : next;
  }
  emit();
}

export function subscribeCompare(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === COMPARE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export type AddResult = "added" | "exists" | "full";

export function addToCompare(entry: CompareEntry): AddResult {
  const current = getCompareSnapshot();
  if (current.some((e) => e.slug === entry.slug)) return "exists";
  if (current.length >= COMPARE_MAX) {
    notifyCompare(COMPARE_FULL_MESSAGE);
    return "full";
  }
  const clean = sanitizeEntry(entry);
  if (!clean) return "exists";
  write([...current, clean]);
  return "added";
}

export function removeFromCompare(slug: string): void {
  const current = getCompareSnapshot();
  if (!current.some((e) => e.slug === slug)) return;
  write(current.filter((e) => e.slug !== slug));
}

export function removeManyFromCompare(slugs: readonly string[]): void {
  const current = getCompareSnapshot();
  const next = current.filter((e) => !slugs.includes(e.slug));
  if (next.length !== current.length) write(next);
}

export function clearCompare(): void {
  if (getCompareSnapshot().length === 0) return;
  write([]);
}

// ───────────── Thông báo ngắn (vd. đã đủ 4 sản phẩm), hiển thị ở thanh so sánh ─────────────

const NOTICE_MS = 4000;
let notice = "";
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const noticeListeners = new Set<() => void>();

export function notifyCompare(message: string): void {
  notice = message;
  noticeListeners.forEach((l) => l());
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice = "";
    noticeListeners.forEach((l) => l());
  }, NOTICE_MS);
}

export function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}
export const getNoticeSnapshot = () => notice;
export const getServerNoticeSnapshot = () => "";

/** Chỉ dùng trong test: đưa module về trạng thái ban đầu. */
export function __resetCompareForTests(): void {
  cachedRaw = null;
  cached = EMPTY_COMPARE;
  memoryOnly = null;
  notice = "";
  clearTimeout(noticeTimer);
}
