import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  groupSecret,
  isTotp,
  normalizeTotp,
  validateAnyCode,
  validateBackup,
  validateTotp,
} from "./twoFactorCode";

describe("twoFactorCode", () => {
  it("TOTP: bỏ khoảng trắng, đúng 6 chữ số", () => {
    expect(normalizeTotp(" 123 456 ")).toBe("123456");
    expect(isTotp("123 456")).toBe(true);
    expect(isTotp("12345")).toBe(false);
    expect(isTotp("12345a")).toBe(false);
    expect(validateTotp("")).toMatch(/Vui lòng nhập/);
    expect(validateTotp("12345")).toBe("Mã gồm đúng 6 chữ số");
    expect(validateTotp("123456")).toBeUndefined();
  });

  it("mã dự phòng: 10 ký tự (bỏ gạch ngang/khoảng trắng)", () => {
    expect(validateBackup("")).toMatch(/Vui lòng nhập/);
    expect(validateBackup("ABCDE-FGHJ")).toMatch(/10 ký tự/);
    expect(validateBackup("ABCDE-FGHJK")).toBeUndefined();
    expect(validateBackup("abcde fghjk")).toBeUndefined();
  });

  it("ô nhận cả hai kiểu mã", () => {
    expect(validateAnyCode("")).toMatch(/Vui lòng nhập/);
    expect(validateAnyCode("123456")).toBeUndefined();
    expect(validateAnyCode("ABCDE-FGHJK")).toBeUndefined();
    expect(validateAnyCode("abc")).toMatch(/6 số hoặc mã dự phòng/);
  });

  it("secret nhóm 4 ký tự; đồng hồ mm:ss không âm", () => {
    expect(groupSecret("ABCDEFGHIJKLMNOP")).toBe("ABCD EFGH IJKL MNOP");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
