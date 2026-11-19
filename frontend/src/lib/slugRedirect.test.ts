import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/errors";

const permanentRedirect = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ permanentRedirect }));

import { lookupFromError, movedToOf, redirectIfMoved } from "./slugRedirect";

const moved = (slug: unknown) => new ApiError(404, "NOT_FOUND", "x", { movedTo: slug });

beforeEach(() => {
  permanentRedirect.mockClear();
});

describe("movedToOf", () => {
  it("lấy slug mới từ 404 có details.movedTo", () => {
    expect(movedToOf(moved("ca-phe-moi"))).toBe("ca-phe-moi");
  });

  it("bỏ qua 404 thường, lỗi khác 404 và movedTo không hợp lệ", () => {
    expect(movedToOf(new ApiError(404, "NOT_FOUND", "x"))).toBeNull();
    expect(movedToOf(new ApiError(404, "NOT_FOUND", "x", [{ field: "a" }]))).toBeNull();
    expect(movedToOf(new ApiError(500, "INTERNAL_ERROR", "x", { movedTo: "abc" }))).toBeNull();
    expect(movedToOf(moved("//evil.com"))).toBeNull();
    expect(movedToOf(moved("a/b"))).toBeNull();
    expect(movedToOf(moved(42))).toBeNull();
    expect(movedToOf(new Error("x"))).toBeNull();
  });
});

describe("lookupFromError", () => {
  it("404 có movedTo -> moved; 404 thường -> missing", () => {
    expect(lookupFromError(moved("moi"))).toEqual({ status: "moved", movedTo: "moi" });
    expect(lookupFromError(new ApiError(404, "NOT_FOUND", "x"))).toEqual({ status: "missing" });
  });

  it("lỗi khác được ném tiếp", () => {
    const e = new ApiError(500, "INTERNAL_ERROR", "x");
    expect(() => lookupFromError(e)).toThrow(e);
  });
});

describe("redirectIfMoved", () => {
  it("slug cũ sản phẩm -> permanentRedirect tới /san-pham/<movedTo>", () => {
    expect(() =>
      redirectIfMoved({ status: "moved", movedTo: "ethiopia-moi" }, "/san-pham"),
    ).toThrow("NEXT_REDIRECT:/san-pham/ethiopia-moi");
    expect(permanentRedirect).toHaveBeenCalledWith("/san-pham/ethiopia-moi");
  });

  it("slug cũ danh mục -> /danh-muc/<movedTo>", () => {
    expect(() => redirectIfMoved({ status: "moved", movedTo: "pour-over" }, "/danh-muc")).toThrow(
      "NEXT_REDIRECT:/danh-muc/pour-over",
    );
  });

  it("ok và missing đi qua, không redirect", () => {
    expect(redirectIfMoved({ status: "ok", data: 1 }, "/san-pham")).toEqual({
      status: "ok",
      data: 1,
    });
    expect(redirectIfMoved({ status: "missing" }, "/danh-muc")).toEqual({ status: "missing" });
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
