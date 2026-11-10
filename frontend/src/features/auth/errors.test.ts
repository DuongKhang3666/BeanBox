import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { formatLockedUntil, mapAuthError } from "./errors";

describe("formatLockedUntil", () => {
  it("định dạng HH:mm dd/MM/yyyy theo giờ Việt Nam (UTC+7)", () => {
    expect(formatLockedUntil("2026-11-10T08:30:00.000Z")).toBe("15:30 10/11/2026");
  });
  it("qua nửa đêm", () => {
    expect(formatLockedUntil("2026-11-10T17:05:00.000Z")).toBe("00:05 11/11/2026");
  });
  it("giá trị sai -> null", () => {
    expect(formatLockedUntil("không phải ngày")).toBeNull();
    expect(formatLockedUntil(undefined)).toBeNull();
  });
});

describe("mapAuthError", () => {
  it("VALIDATION_ERROR map theo field", () => {
    const e = new ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
      { field: "email", message: "Email không đúng định dạng" },
      { field: "password", message: "Mật khẩu quá ngắn" },
    ]);
    expect(mapAuthError(e)).toEqual({
      fieldErrors: { email: "Email không đúng định dạng", password: "Mật khẩu quá ngắn" },
    });
  });
  it("field lạ gộp vào lỗi chung khi có knownFields", () => {
    const e = new ApiError(400, "VALIDATION_ERROR", "x", [
      { field: "token", message: "Thiếu token" },
    ]);
    expect(mapAuthError(e, ["email"])).toEqual({ formError: "Thiếu token", fieldErrors: {} });
  });
  it("VALIDATION_ERROR không có details -> lỗi chung", () => {
    const e = new ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ");
    expect(mapAuthError(e).formError).toBe("Dữ liệu không hợp lệ");
  });
  it("INVALID_CREDENTIALS", () => {
    const e = new ApiError(401, "INVALID_CREDENTIALS", "msg server");
    expect(mapAuthError(e).formError).toBe("Email hoặc mật khẩu không đúng");
  });
  it("ACCOUNT_LOCKED có giờ VN", () => {
    const e = new ApiError(403, "ACCOUNT_LOCKED", "x", { lockedUntil: "2026-11-10T08:30:00.000Z" });
    expect(mapAuthError(e).formError).toBe("Tài khoản tạm khóa đến 15:30 10/11/2026");
  });
  it("ACCOUNT_LOCKED thiếu details vẫn có thông báo", () => {
    expect(mapAuthError(new ApiError(403, "ACCOUNT_LOCKED", "x")).formError).toMatch(/tạm khóa/);
  });
  it("ACCOUNT_DISABLED", () => {
    expect(mapAuthError(new ApiError(403, "ACCOUNT_DISABLED", "x")).formError).toMatch(
      /vô hiệu hóa/,
    );
  });
  it("EMAIL_TAKEN là lỗi field email", () => {
    expect(mapAuthError(new ApiError(409, "EMAIL_TAKEN", "x"))).toEqual({
      fieldErrors: { email: "Email đã được sử dụng" },
    });
  });
  it("RATE_LIMITED có số giây", () => {
    const e = new ApiError(429, "RATE_LIMITED", "x", { retryAfterSec: 42 });
    expect(mapAuthError(e).formError).toContain("Thử lại sau 42 giây");
  });
  it("RATE_LIMITED không có retryAfterSec", () => {
    expect(mapAuthError(new ApiError(429, "RATE_LIMITED", "x")).formError).toMatch(/quá nhanh/);
  });
  it("NETWORK_ERROR", () => {
    expect(mapAuthError(new ApiError(0, "NETWORK_ERROR", "x")).formError).toMatch(/kết nối/);
  });
  it("mã khác dùng message server", () => {
    expect(mapAuthError(new ApiError(500, "INTERNAL_ERROR", "Lỗi hệ thống")).formError).toBe(
      "Lỗi hệ thống",
    );
  });
  it("lỗi không phải ApiError", () => {
    expect(mapAuthError(new Error("boom")).formError).toMatch(/Đã có lỗi/);
  });
});
