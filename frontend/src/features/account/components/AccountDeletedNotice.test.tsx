import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeletedNotice } from "./AccountDeletedNotice";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

beforeEach(() => {
  search = new URLSearchParams();
});

describe("AccountDeletedNotice", () => {
  it("không có query thì không hiện gì", () => {
    render(<AccountDeletedNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("?tai-khoan=da-xoa hiện thông báo và đóng được", async () => {
    search = new URLSearchParams({ "tai-khoan": "da-xoa" });
    render(<AccountDeletedNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Tài khoản của bạn đã được xóa");
    await userEvent.setup().click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
