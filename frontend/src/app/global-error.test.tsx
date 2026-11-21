import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

vi.mock("./globals.css", () => ({}));

describe("global-error", () => {
  it("hiện thông điệp tiếng Việt, nút Thử lại gọi reset, link về trang chủ, log digest", async () => {
    const reset = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("layout gốc hỏng"), { digest: "abc123" });
    render(<GlobalError error={error} reset={reset} />, {
      container: document.documentElement,
    });

    expect(screen.getByRole("heading", { name: "Hệ thống đang gặp sự cố" })).toBeInTheDocument();
    expect(screen.getByText("Mã lỗi: abc123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("global-error", "abc123", error);
    spy.mockRestore();
  });
});
