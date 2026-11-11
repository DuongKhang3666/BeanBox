import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { IdempotencyKeys } from "./idempotency";

describe("IdempotencyKeys", () => {
  it("cùng payload -> cùng key; payload đổi -> key mới", () => {
    const k = new IdempotencyKeys();
    const a = k.keyFor("p1");
    expect(k.keyFor("p1")).toBe(a);
    expect(k.keyFor("p2")).not.toBe(a);
  });

  it("lỗi mạng / 5xx / 429 giữ key", () => {
    for (const err of [
      new ApiError(0, "NETWORK_ERROR", "x"),
      new ApiError(500, "INTERNAL_ERROR", "x"),
      new ApiError(503, "SERVICE_UNAVAILABLE", "x"),
      new ApiError(429, "RATE_LIMITED", "x"),
      new TypeError("boom"),
    ]) {
      const k = new IdempotencyKeys();
      const a = k.keyFor("p");
      k.onError(err);
      expect(k.keyFor("p")).toBe(a);
    }
  });

  it("4xx nghiệp vụ dứt khoát (kể cả IDEMPOTENCY_CONFLICT) -> key mới dù payload không đổi", () => {
    for (const err of [
      new ApiError(409, "IDEMPOTENCY_CONFLICT", "x"),
      new ApiError(409, "OUT_OF_STOCK", "x"),
      new ApiError(400, "VALIDATION_ERROR", "x"),
    ]) {
      const k = new IdempotencyKeys();
      const a = k.keyFor("p");
      k.onError(err);
      expect(k.keyFor("p")).not.toBe(a);
    }
  });
});
