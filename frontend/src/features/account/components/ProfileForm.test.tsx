import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/auth";
import { bodyOf, errRes, jsonRes, makeUser } from "../testing";
import { ProfileForm } from "./ProfileForm";

const setUser = vi.fn();
let current: User = makeUser();

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: current, setUser, status: "authenticated" }),
}));

beforeEach(() => {
  setUser.mockReset();
  current = makeUser();
});
afterEach(() => vi.unstubAllGlobals());

describe("ProfileForm", () => {
  it("không có thay đổi -> nút lưu bị disable", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ProfileForm />);
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  });

  it("chỉ gửi trường đã đổi, chuẩn hóa SĐT, cập nhật user và báo Đã lưu", async () => {
    const updated = makeUser({ fullName: "Nguyễn Văn Bình", phone: "0912345678" });
    const fetchMock = vi.fn(async () => jsonRes(200, { data: updated }));
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ProfileForm />);

    await u.clear(screen.getByLabelText("Họ và tên"));
    await u.type(screen.getByLabelText("Họ và tên"), "Nguyễn Văn Bình");
    await u.clear(screen.getByLabelText("Số điện thoại"));
    await u.type(screen.getByLabelText("Số điện thoại"), "+84 912-345-678");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(updated));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0)).toEqual({ fullName: "Nguyễn Văn Bình", phone: "0912345678" });
    expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu");
  });

  it("xóa ô SĐT -> gửi phone: null (chỉ trường đó)", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, { data: makeUser({ phone: null }) }));
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ProfileForm />);
    await u.clear(screen.getByLabelText("Số điện thoại"));
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 0)).toEqual({ phone: null });
  });

  it("SĐT sai định dạng bị chặn ở client, không gọi mạng", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ProfileForm />);
    await u.clear(screen.getByLabelText("Số điện thoại"));
    await u.type(screen.getByLabelText("Số điện thoại"), "12345");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText(/Số điện thoại không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("avatarUrl không phải http(s) bị chặn; xóa ngày sinh/ảnh -> null", async () => {
    current = makeUser({ birthDate: "1990-05-01", avatarUrl: "https://x.test/a.png" });
    const fetchMock = vi.fn(async () =>
      jsonRes(200, { data: makeUser({ birthDate: null, avatarUrl: null }) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const u = userEvent.setup();
    render(<ProfileForm />);
    await u.clear(screen.getByLabelText("Đường dẫn ảnh đại diện"));
    await u.type(screen.getByLabelText("Đường dẫn ảnh đại diện"), "ftp://x.test/a.png");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText(/http:\/\/ hoặc https:\/\//)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await u.clear(screen.getByLabelText("Đường dẫn ảnh đại diện"));
    await u.clear(screen.getByLabelText("Ngày sinh"));
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 0)).toEqual({ birthDate: null, avatarUrl: null });
  });

  it("ngày sinh có max là ngày hôm nay", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ProfileForm />);
    expect(screen.getByLabelText("Ngày sinh")).toHaveAttribute(
      "max",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("VALIDATION_ERROR từ server hiện đúng field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "fullName", message: "Họ tên chứa ký tự không hợp lệ" },
        ]),
      ),
    );
    const u = userEvent.setup();
    render(<ProfileForm />);
    await u.type(screen.getByLabelText("Họ và tên"), " Mới");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Họ tên chứa ký tự không hợp lệ")).toBeInTheDocument();
    expect(screen.getByLabelText("Họ và tên")).toHaveAttribute("aria-invalid", "true");
    expect(setUser).not.toHaveBeenCalled();
  });
});
