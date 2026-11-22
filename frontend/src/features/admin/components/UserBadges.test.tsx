import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserStatusBadges } from "./UserBadges";

describe("UserStatusBadges", () => {
  it("tài khoản khách tự xóa chỉ hiện nhãn Đã xóa (không hiện Đã khóa)", () => {
    render(<UserStatusBadges user={{ status: "DISABLED", lockedUntil: null, deleted: true }} />);
    expect(screen.getByText("Đã xóa")).toBeInTheDocument();
    expect(screen.queryByText("Đã khóa")).toBeNull();
  });

  it("tài khoản bị admin khóa vẫn hiện trạng thái khóa", () => {
    render(<UserStatusBadges user={{ status: "DISABLED", lockedUntil: null, deleted: false }} />);
    expect(screen.queryByText("Đã xóa")).toBeNull();
    expect(screen.getByText("Đã khóa")).toBeInTheDocument();
  });
});
