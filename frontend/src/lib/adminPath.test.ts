import { describe, expect, it } from "vitest";
import { isAdminPath } from "./adminPath";

describe("isAdminPath", () => {
  it.each(["/admin", "/admin/", "/admin/don-hang", "/admin?x=1", "/admin#a"])("%s -> true", (p) => {
    expect(isAdminPath(p)).toBe(true);
  });

  it.each(["/adminx", "/admin-x", "/", "/tai-khoan", "/x/admin", "admin", "//admin", ""])(
    "%s -> false",
    (p) => {
      expect(isAdminPath(p)).toBe(false);
    },
  );
});
