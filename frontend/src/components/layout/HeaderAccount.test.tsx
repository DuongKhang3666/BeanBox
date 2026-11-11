import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeUser } from "@/features/account/testing";
import type { UserRole } from "@/types/auth";
import { HeaderAccount } from "./HeaderAccount";

let auth: { status: string; user: ReturnType<typeof makeUser> | null; logout: () => Promise<void> };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));

function renderAs(role: UserRole | null) {
  auth = role
    ? { status: "authenticated", user: makeUser({ role }), logout: async () => {} }
    : { status: "anonymous", user: null, logout: async () => {} };
  render(<HeaderAccount />);
}

describe("HeaderAccount - link Quản trị", () => {
  it.each(["STAFF", "ADMIN"] as const)("%s thấy link Quản trị", (role) => {
    renderAs(role);
    expect(screen.getByRole("link", { name: "Quản trị" })).toHaveAttribute(
      "href",
      "/admin/don-hang",
    );
  });

  it("CUSTOMER không thấy", () => {
    renderAs("CUSTOMER");
    expect(screen.queryByRole("link", { name: "Quản trị" })).not.toBeInTheDocument();
  });

  it("anonymous không thấy", () => {
    renderAs(null);
    expect(screen.queryByRole("link", { name: "Quản trị" })).not.toBeInTheDocument();
  });
});
