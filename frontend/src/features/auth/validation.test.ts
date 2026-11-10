import { describe, expect, it } from "vitest";
import {
  isValidPhone,
  normalizePhone,
  validateEmail,
  validateFullName,
  validateOptionalPhone,
  validatePassword,
  validatePasswordConfirm,
} from "./validation";

describe("normalizePhone (D-007)", () => {
  it("bỏ khoảng trắng, dấu chấm, gạch ngang", () => {
    expect(normalizePhone("090 123 4567")).toBe("0901234567");
    expect(normalizePhone("090.123.4567")).toBe("0901234567");
    expect(normalizePhone("090-123-4567")).toBe("0901234567");
  });
  it("+84 đầu -> 0", () => {
    expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
    expect(normalizePhone("+84901234567")).toBe("0901234567");
  });
  it("không đổi +84 ở giữa chuỗi", () => {
    expect(normalizePhone("0901+84")).toBe("0901+84");
  });
  it("isValidPhone khớp ^0(3|5|7|8|9)\\d{8}$", () => {
    expect(isValidPhone("0901234567")).toBe(true);
    expect(isValidPhone("+84 33 123 4567")).toBe(true);
    expect(isValidPhone("0201234567")).toBe(false); // đầu số 02
    expect(isValidPhone("0101234567")).toBe(false);
    expect(isValidPhone("090123456")).toBe(false); // 9 số
    expect(isValidPhone("09012345678")).toBe(false); // 11 số
    expect(isValidPhone("abc")).toBe(false);
  });
  it("SĐT tùy chọn: rỗng hợp lệ", () => {
    expect(validateOptionalPhone("")).toBeNull();
    expect(validateOptionalPhone("   ")).toBeNull();
    expect(validateOptionalPhone("123")).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("biên độ dài 8 và 72", () => {
    expect(validatePassword("abcdef1")).toMatch(/tối thiểu 8/); // 7
    expect(validatePassword("abcdefg1")).toBeNull(); // 8
    expect(validatePassword("a".repeat(71) + "1")).toBeNull(); // 72
    expect(validatePassword("a".repeat(72) + "1")).toMatch(/tối đa 72/); // 73
  });
  it("cần chữ và số", () => {
    expect(validatePassword("12345678")).toMatch(/chữ cái/);
    expect(validatePassword("abcdefgh")).toMatch(/chữ số/);
  });
  it("chữ có dấu tính là chữ cái", () => {
    expect(validatePassword("Mậtkhẩu1")).toBeNull();
  });
  it("rỗng", () => {
    expect(validatePassword("")).not.toBeNull();
  });
  it("nhập lại", () => {
    expect(validatePasswordConfirm("abc12345", "abc12345")).toBeNull();
    expect(validatePasswordConfirm("abc12345", "abc12346")).toMatch(/không khớp/);
    expect(validatePasswordConfirm("abc12345", "")).not.toBeNull();
  });
});

describe("validateEmail / validateFullName", () => {
  it("email", () => {
    expect(validateEmail("an@example.com")).toBeNull();
    expect(validateEmail("  an@example.com  ")).toBeNull();
    expect(validateEmail("")).not.toBeNull();
    expect(validateEmail("an@example")).not.toBeNull();
    expect(validateEmail("an example@x.com")).not.toBeNull();
    expect(validateEmail(`${"a".repeat(250)}@x.com`)).not.toBeNull();
  });
  it("họ tên 2-100", () => {
    expect(validateFullName("A")).not.toBeNull();
    expect(validateFullName(" A ")).not.toBeNull();
    expect(validateFullName("An")).toBeNull();
    expect(validateFullName("a".repeat(100))).toBeNull();
    expect(validateFullName("a".repeat(101))).not.toBeNull();
  });
});
