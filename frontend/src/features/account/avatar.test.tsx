import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isAllowedAvatarUrl, isAvatarUrlShapeValid } from "./avatar";
import { Avatar, avatarInitial } from "./components/Avatar";
import { validateAvatarUrl } from "./validation";

const HOSTS = ["cdn.example.test"];

describe("isAllowedAvatarUrl (D-081)", () => {
  it("nhận /uploads hợp lệ và https có host trong allowlist", () => {
    expect(isAllowedAvatarUrl("/uploads/a.png", [])).toBe(true);
    expect(isAllowedAvatarUrl("/uploads/seed/x-1.svg", [])).toBe(true);
    expect(isAllowedAvatarUrl("https://cdn.example.test/a.png", HOSTS)).toBe(true);
    expect(isAllowedAvatarUrl("https://CDN.example.test/a.png?v=1", HOSTS)).toBe(true);
  });

  it("từ chối mọi dạng còn lại", () => {
    for (const v of [
      null,
      undefined,
      "",
      "http://cdn.example.test/a.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//cdn.example.test/a.png",
      "/uploads/../a.png",
      "/uploads//a.png",
      "/uploads/a.png?x=1",
      "/uploads/a.png#h",
      "/other/a.png",
      "https://evil.test/a.png",
      "https://cdn.example.test.evil.test/a.png",
      "https://u:p@cdn.example.test/a.png",
      "https://cdn.example.test:8443/a.png",
      "https://cdn.example.test/a.png#x",
    ]) {
      expect(isAllowedAvatarUrl(v, HOSTS), String(v)).toBe(false);
    }
    expect(isAllowedAvatarUrl("https://cdn.example.test/a.png", [])).toBe(false);
    expect(isAvatarUrlShapeValid("x".repeat(501))).toBe(false);
  });
});

describe("validateAvatarUrl", () => {
  it("rỗng hợp lệ; sai dạng có thông báo tiếng Việt", () => {
    expect(validateAvatarUrl("  ")).toBeNull();
    expect(validateAvatarUrl("/uploads/a.png")).toBeNull();
    expect(validateAvatarUrl("https://cdn.example.test/a.png")).toBeNull();
    expect(validateAvatarUrl("http://x.test/a.png")).toMatch(/\/uploads\//);
    expect(validateAvatarUrl("javascript:alert(1)")).toMatch(/https/);
    expect(validateAvatarUrl(`/uploads/${"a".repeat(500)}`)).toMatch(/tối đa 500/);
  });
});

describe("Avatar", () => {
  it("URL hợp lệ -> render ảnh", () => {
    render(<Avatar fullName="Trần Thị Bình" url="/uploads/avatars/a.png" />);
    const img = screen.getByAltText("Ảnh đại diện của Trần Thị Bình");
    expect(img).toHaveAttribute("src", "/uploads/avatars/a.png");
  });

  it("URL cũ không hợp lệ hoặc không có -> chữ cái đầu, không có <img>", () => {
    const { container, rerender } = render(
      <Avatar fullName="Trần Thị Bình" url="javascript:alert(1)" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Ảnh đại diện của Trần Thị Bình" })).toHaveTextContent(
      "B",
    );
    rerender(<Avatar fullName="Trần Thị Bình" url="http://x.test/a.png" />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Avatar fullName="  " url={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(avatarInitial("  ")).toBe("?");
    expect(avatarInitial("đức")).toBe("Đ");
  });
});
