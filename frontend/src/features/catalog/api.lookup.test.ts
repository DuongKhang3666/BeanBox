import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const serverGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/server", () => ({ serverGet }));

import { lookupCategory, lookupProduct } from "./api";

beforeEach(() => {
  serverGet.mockReset();
});

describe("lookupProduct", () => {
  it("200 -> ok", async () => {
    serverGet.mockResolvedValue({ data: { slug: "a" } });
    expect(await lookupProduct("a")).toEqual({ status: "ok", data: { slug: "a" } });
    expect(serverGet.mock.calls[0]![0]).toBe("/products/a");
  });

  it("404 có details.movedTo -> moved", async () => {
    serverGet.mockRejectedValue(new ApiError(404, "NOT_FOUND", "x", { movedTo: "b" }));
    expect(await lookupProduct("a")).toEqual({ status: "moved", movedTo: "b" });
  });

  it("404 thường -> missing; lỗi khác ném tiếp", async () => {
    serverGet.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    expect(await lookupProduct("a")).toEqual({ status: "missing" });
    serverGet.mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "x"));
    await expect(lookupProduct("a")).rejects.toMatchObject({ status: 503 });
  });
});

describe("lookupCategory", () => {
  it("gọi GET /categories/:slug và nhận biết slug cũ", async () => {
    serverGet.mockResolvedValueOnce({ data: { slug: "specialty", name: "Specialty" } });
    expect(await lookupCategory("specialty")).toMatchObject({ status: "ok" });
    expect(serverGet.mock.calls[0]![0]).toBe("/categories/specialty");

    serverGet.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x", { movedTo: "moi" }));
    expect(await lookupCategory("cu")).toEqual({ status: "moved", movedTo: "moi" });
  });
});
