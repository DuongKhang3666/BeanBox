import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCompareForTests,
  addToCompare,
  clearCompare,
  COMPARE_KEY,
  COMPARE_MAX,
  getCompareSnapshot,
  getServerCompareSnapshot,
  parseCompare,
  removeFromCompare,
  removeManyFromCompare,
  type CompareEntry,
} from "./store";
import { useCompare } from "./useCompare";

const entry = (n: number, over: Partial<CompareEntry> = {}): CompareEntry => ({
  slug: `sp-${n}`,
  name: `Sản phẩm ${n}`,
  imageUrl: `/uploads/${n}.jpg`,
  categoryName: "Cà phê hạt",
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  __resetCompareForTests();
});

describe("compare store", () => {
  it("thêm, trùng slug bị bỏ qua, bỏ từng món và xóa hết", () => {
    expect(addToCompare(entry(1))).toBe("added");
    expect(addToCompare(entry(1))).toBe("exists");
    expect(addToCompare(entry(2))).toBe("added");
    expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["sp-1", "sp-2"]);
    removeFromCompare("sp-1");
    expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["sp-2"]);
    removeManyFromCompare(["sp-2", "khong-co"]);
    expect(getCompareSnapshot()).toHaveLength(0);
    addToCompare(entry(3));
    clearCompare();
    expect(getCompareSnapshot()).toHaveLength(0);
    expect(window.localStorage.getItem(COMPARE_KEY)).toBeNull();
  });

  it("tối đa 4: món thứ 5 bị từ chối", () => {
    for (let i = 1; i <= COMPARE_MAX; i++) expect(addToCompare(entry(i))).toBe("added");
    expect(addToCompare(entry(5))).toBe("full");
    expect(getCompareSnapshot()).toHaveLength(COMPARE_MAX);
  });

  it("lưu vào localStorage và khôi phục sau khi tải lại", () => {
    addToCompare(entry(1));
    addToCompare(entry(2));
    const saved = window.localStorage.getItem(COMPARE_KEY);
    expect(JSON.parse(saved!)).toHaveLength(2);
    __resetCompareForTests(); // giả lập tải lại trang
    expect(getCompareSnapshot()).toEqual([entry(1), entry(2)]);
  });

  it("snapshot ổn định khi dữ liệu không đổi (an toàn cho useSyncExternalStore)", () => {
    addToCompare(entry(1));
    expect(getCompareSnapshot()).toBe(getCompareSnapshot());
    expect(getServerCompareSnapshot()).toHaveLength(0);
  });

  it("dữ liệu hỏng -> rỗng, không ném lỗi", () => {
    for (const bad of ["{không phải json", "123", '"abc"', '{"a":1}', "null", ""]) {
      window.localStorage.setItem(COMPARE_KEY, bad);
      __resetCompareForTests();
      expect(getCompareSnapshot()).toHaveLength(0);
    }
  });

  it("bỏ phần tử sai kiểu/slug sai/trùng và cắt còn 4", () => {
    const raw = JSON.stringify([
      entry(1),
      null,
      "x",
      { slug: "Sai Slug", name: "A", imageUrl: null, categoryName: null },
      { slug: "ok-2", name: "", imageUrl: null, categoryName: null },
      { slug: "ok-3", name: "Tên", imageUrl: 5, categoryName: 7 },
      entry(1),
      entry(4),
      entry(5),
      entry(6),
    ]);
    const parsed = parseCompare(raw);
    expect(parsed.map((e) => e.slug)).toEqual(["sp-1", "ok-3", "sp-4", "sp-5"]);
    expect(parsed[1]).toEqual({ slug: "ok-3", name: "Tên", imageUrl: null, categoryName: null });
  });

  it("imageUrl chỉ nhận đường dẫn nội bộ, còn lại -> null", () => {
    const cases: [unknown, string | null][] = [
      ["https://evil.example/a.jpg", null],
      ["http://evil.example/a.jpg", null],
      ["//evil.example/a.jpg", null],
      ["javascript:alert(1)", null],
      ["/\\evil.example/a.jpg", null],
      ["\\\\evil.example\\a.jpg", null],
      ["", null],
      ["/uploads/ok.jpg", "/uploads/ok.jpg"],
    ];
    for (const [url, expected] of cases) {
      const parsed = parseCompare(
        JSON.stringify([{ slug: "sp-x", name: "X", imageUrl: url, categoryName: null }]),
      );
      expect(parsed[0]?.imageUrl).toBe(expected);
    }
    // đường ghi cũng được làm sạch
    addToCompare(entry(1, { imageUrl: "https://evil.example/a.jpg" }));
    expect(getCompareSnapshot()[0]?.imageUrl).toBeNull();
  });

  it("đồng bộ giữa tab qua sự kiện storage và cập nhật hook", () => {
    const { result } = renderHook(() => useCompare());
    expect(result.current.items).toHaveLength(0);
    act(() => {
      window.localStorage.setItem(COMPARE_KEY, JSON.stringify([entry(1), entry(2)]));
      window.dispatchEvent(new StorageEvent("storage", { key: COMPARE_KEY }));
    });
    expect(result.current.items.map((e) => e.slug)).toEqual(["sp-1", "sp-2"]);
    expect(result.current.has("sp-2")).toBe(true);
    act(() => {
      window.localStorage.removeItem(COMPARE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: COMPARE_KEY }));
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("bỏ qua sự kiện storage của khóa khác", () => {
    const { result } = renderHook(() => useCompare());
    const before = result.current.items;
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "khoa_khac" }));
    });
    expect(result.current.items).toBe(before);
  });

  it("localStorage ném lỗi: vẫn hoạt động trong bộ nhớ của tab", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(addToCompare(entry(1))).toBe("added");
    expect(getCompareSnapshot()).toHaveLength(1);
    set.mockRestore();
  });
});
