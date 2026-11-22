import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goToPayment, isMockGatewayUrl, safeResultPath } from "./redirect";

const ORIGIN = "http://localhost:3000";
const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, origin: ORIGIN, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("goToPayment", () => {
  it("https được phép; http và loại khác bị từ chối", () => {
    expect(goToPayment("https://sandbox.vnpayment.vn/pay?a=1")).toBe(true);
    expect(assign).toHaveBeenCalledWith("https://sandbox.vnpayment.vn/pay?a=1");
    for (const bad of [
      "http://sandbox.vnpayment.vn/pay",
      "javascript:alert(1)",
      "//evil.example/x",
      "/cong-thanh-toan-gia-lap/vnpay",
      null,
      42,
    ]) {
      expect(goToPayment(bad)).toBe(false);
    }
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("trang cổng giả cùng origin (http cục bộ) được phép; origin khác hoặc đường dẫn khác thì không", () => {
    expect(goToPayment(`${ORIGIN}/cong-thanh-toan-gia-lap/momo?a=1`)).toBe(true);
    expect(assign).toHaveBeenCalledWith(`${ORIGIN}/cong-thanh-toan-gia-lap/momo?a=1`);
    expect(goToPayment("http://evil.example/cong-thanh-toan-gia-lap/momo")).toBe(false);
    expect(goToPayment(`${ORIGIN}/admin`)).toBe(false);
    expect(goToPayment(`${ORIGIN}/cong-thanh-toan-gia-lapx`)).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe("isMockGatewayUrl / safeResultPath", () => {
  it("isMockGatewayUrl", () => {
    expect(isMockGatewayUrl(`${ORIGIN}/cong-thanh-toan-gia-lap/vnpay`, ORIGIN)).toBe(true);
    expect(isMockGatewayUrl("not a url", ORIGIN)).toBe(false);
    expect(isMockGatewayUrl(undefined, ORIGIN)).toBe(false);
  });

  it("safeResultPath: chỉ cùng origin và đúng /thanh-toan/ket-qua; trả path + query", () => {
    expect(safeResultPath(`${ORIGIN}/thanh-toan/ket-qua?provider=momo&x=1`, ORIGIN)).toBe(
      "/thanh-toan/ket-qua?provider=momo&x=1",
    );
    expect(safeResultPath("https://evil.example/thanh-toan/ket-qua", ORIGIN)).toBeNull();
    expect(safeResultPath(`${ORIGIN}/admin`, ORIGIN)).toBeNull();
    expect(safeResultPath("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(safeResultPath(5, ORIGIN)).toBeNull();
  });
});
