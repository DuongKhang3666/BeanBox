import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SearchLoading from "@/app/tim-kiem/loading";

describe("loading.tsx của /tim-kiem", () => {
  it("có role=status, aria-busy và chữ ẩn 'Đang tải...'", () => {
    render(<SearchLoading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Đang tải...");
    expect(status.querySelector(".sr-only")).not.toBeNull();
  });

  // D-059: loading.tsx ở route slug làm notFound()/redirect 308 thành HTTP 200 do streaming.
  it("không có loading.tsx ở /san-pham/[slug] và /danh-muc/[slug]", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const app = resolve(__dirname, "../../../app");
    expect(existsSync(resolve(app, "san-pham/[slug]/loading.tsx"))).toBe(false);
    expect(existsSync(resolve(app, "danh-muc/[slug]/loading.tsx"))).toBe(false);
  });
});
