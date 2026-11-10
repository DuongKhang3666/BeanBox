import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safeRedirect";

describe("safeRedirect", () => {
  it("cho phép đường dẫn nội bộ (kèm query/hash)", () => {
    expect(safeRedirect("/gio-hang")).toBe("/gio-hang");
    expect(safeRedirect("/san-pham/abc?x=1#y")).toBe("/san-pham/abc?x=1#y");
    expect(safeRedirect("/")).toBe("/");
  });
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["http://evil.com/x"],
    ["javascript:alert(1)"],
    ["evil.com"],
    [""],
    ["/ok\nSet-Cookie: a=b"],
    ["/ok\r\n"],
    ["/a\u0000b"],
    ["/a\tb"],
  ])("từ chối %j", (input) => {
    expect(safeRedirect(input)).toBe("/tai-khoan");
  });
  it("null/undefined -> mặc định", () => {
    expect(safeRedirect(null)).toBe("/tai-khoan");
    expect(safeRedirect(undefined)).toBe("/tai-khoan");
  });
});
