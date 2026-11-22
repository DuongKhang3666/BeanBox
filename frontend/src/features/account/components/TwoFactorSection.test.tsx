import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/auth";
import { bodyOf, errRes, jsonRes, makeUser } from "../testing";
import { TwoFactorSection } from "./TwoFactorSection";

const reloadUser = vi.fn(async () => {});
let current: User = makeUser();

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: current, reloadUser, status: "authenticated" }),
}));

const SETUP = {
  secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  otpauthUri: "otpauth://totp/BeanBox:nv%40example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
  qrDataUrl: "data:image/png;base64,AAAA",
};
const CODES = Array.from({ length: 10 }, (_, i) => `ABCD${i}-EFGH${i}`);

function stub(route: (url: string, body: unknown) => Response) {
  const mock = vi.fn(async (url: string, init: RequestInit = {}) =>
    route(url, init.body ? JSON.parse(init.body as string) : undefined),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  reloadUser.mockClear();
  current = makeUser({ role: "STAFF", twoFactorEnabled: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("TwoFactorSection: hiển thị theo vai trò", () => {
  it("CUSTOMER không thấy mục này", () => {
    current = makeUser({ role: "CUSTOMER" });
    const { container } = render(<TwoFactorSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("STAFF/ADMIN chưa bật: nhãn Chưa bật + nút bật; đã bật: nhãn Đã bật + nút tắt/tạo lại", () => {
    const { unmount } = render(<TwoFactorSection />);
    expect(screen.getByRole("heading", { name: "Xác thực 2 lớp" })).toBeInTheDocument();
    expect(screen.getByText("Chưa bật")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bật xác thực 2 lớp" })).toBeInTheDocument();
    unmount();

    current = makeUser({ role: "ADMIN", twoFactorEnabled: true });
    render(<TwoFactorSection />);
    expect(screen.getByText("Đã bật")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo lại mã dự phòng" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bật xác thực 2 lớp" })).toBeNull();
  });
});

async function startSetup(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "Bật xác thực 2 lớp" }));
  await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
  await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
}

describe("TwoFactorSection: thiết lập", () => {
  it("luồng đầy đủ: mật khẩu -> QR + secret nhóm 4 + mã 6 số -> mã dự phòng -> hoàn tất", async () => {
    const mock = stub((url) =>
      url.endsWith("/me/2fa/setup")
        ? jsonRes(200, { data: SETUP })
        : url.endsWith("/me/2fa/enable")
          ? jsonRes(200, { data: { backupCodes: CODES } })
          : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await u.click(screen.getByRole("button", { name: "Bật xác thực 2 lớp" }));

    // bước mật khẩu: để trống -> lỗi, không gọi mạng
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(await screen.findByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();

    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.click(screen.getByRole("button", { name: "Tiếp tục" }));

    // bước quét QR
    const img = await screen.findByRole("img", { name: /Mã QR để thêm tài khoản BeanBox/ });
    expect(img).toHaveAttribute("src", SETUP.qrDataUrl);
    expect(screen.getByTestId("tf-secret")).toHaveTextContent(
      "ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567",
    );
    const code = screen.getByLabelText("Mã 6 số từ ứng dụng");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(bodyOf(mock, 0)).toEqual({ password: "Matkhau123" });

    await u.type(code, "123 456");
    await u.click(screen.getByRole("button", { name: "Xác nhận và bật" }));

    // mã dự phòng hiện một lần
    expect(await screen.findByRole("heading", { name: "Lưu mã dự phòng của bạn" })).toHaveFocus();
    expect(bodyOf(mock, 1)).toEqual({ code: "123456" });
    const list = screen.getByRole("list", { name: "Danh sách mã dự phòng" });
    expect(within(list).getAllByTestId("backup-code")).toHaveLength(10);
    expect(list).toHaveTextContent("ABCD0-EFGH0");
    expect(screen.getByRole("alert")).toHaveTextContent(/chỉ hiển thị một lần/);

    const done = screen.getByRole("button", { name: "Hoàn tất" });
    expect(done).toBeDisabled();
    await u.click(screen.getByLabelText(/Tôi đã lưu các mã dự phòng/));
    expect(done).toBeEnabled();
    await u.click(done);

    await waitFor(() => expect(reloadUser).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Đã bật xác thực 2 lớp\. Các thiết bị khác/),
    ).toBeInTheDocument();
    // secret/mã dự phòng không còn trên màn hình
    expect(screen.queryByTestId("tf-secret")).toBeNull();
    expect(screen.queryByTestId("backup-code")).toBeNull();
  });

  it("sai mật khẩu: lỗi ở ô mật khẩu, ở lại bước mật khẩu", async () => {
    stub(() => errRes(400, "INVALID_PASSWORD", "Mật khẩu không đúng"));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await startSetup(u);
    expect(await screen.findByText("Mật khẩu không đúng")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveAttribute("aria-invalid", "true");
  });

  it("503 chưa cấu hình khóa: thông báo lỗi chung", async () => {
    stub(() => errRes(503, "TWO_FACTOR_UNAVAILABLE", "x"));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await startSetup(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(/tạm thời không khả dụng/);
  });

  it("sai mã khi bật: báo lỗi ở ô mã, vẫn ở bước quét", async () => {
    stub((url) =>
      url.endsWith("/me/2fa/setup")
        ? jsonRes(200, { data: SETUP })
        : errRes(400, "TWO_FACTOR_INVALID", "x"),
    );
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await startSetup(u);
    await u.type(await screen.findByLabelText("Mã 6 số từ ứng dụng"), "000000");
    await u.click(screen.getByRole("button", { name: "Xác nhận và bật" }));
    expect(await screen.findByText(/Mã không đúng/)).toBeInTheDocument();
    expect(screen.getByTestId("tf-secret")).toBeInTheDocument();
    expect(reloadUser).not.toHaveBeenCalled();
  });

  it("mã sai định dạng không gọi mạng", async () => {
    const mock = stub((url) =>
      url.endsWith("/me/2fa/setup") ? jsonRes(200, { data: SETUP }) : jsonRes(404, {}),
    );
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await startSetup(u);
    await u.type(await screen.findByLabelText("Mã 6 số từ ứng dụng"), "12");
    await u.click(screen.getByRole("button", { name: "Xác nhận và bật" }));
    expect(await screen.findByText("Mã gồm đúng 6 chữ số")).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1); // chỉ lần setup
  });

  it("Hủy ở bước quét quay về trạng thái ban đầu", async () => {
    stub(() => jsonRes(200, { data: SETUP }));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await startSetup(u);
    await screen.findByTestId("tf-secret");
    await u.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("button", { name: "Bật xác thực 2 lớp" })).toBeInTheDocument();
    expect(screen.queryByTestId("tf-secret")).toBeNull();
  });
});

describe("TwoFactorSection: mã dự phòng (sao chép / tải về)", () => {
  async function toCodes(u: ReturnType<typeof userEvent.setup>) {
    await startSetup(u);
    await u.type(await screen.findByLabelText("Mã 6 số từ ứng dụng"), "123456");
    await u.click(screen.getByRole("button", { name: "Xác nhận và bật" }));
    await screen.findByRole("list", { name: "Danh sách mã dự phòng" });
  }
  const route = (url: string) =>
    url.endsWith("/me/2fa/setup")
      ? jsonRes(200, { data: SETUP })
      : jsonRes(200, { data: { backupCodes: CODES } });

  it("Sao chép ghi 10 mã vào clipboard và báo trạng thái; lỗi clipboard có thông báo", async () => {
    stub(route);
    const u = userEvent.setup({ writeToClipboard: false });
    const writeText = vi.fn<(t: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<TwoFactorSection />);
    await toCodes(u);
    await u.click(screen.getByRole("button", { name: "Sao chép" }));
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
    expect(await screen.findByText("Đã sao chép.")).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error("denied"));
    await u.click(screen.getByRole("button", { name: "Sao chép" }));
    expect(await screen.findByText(/Không sao chép được/)).toBeInTheDocument();
  });

  it("Tải về tạo file .txt (Blob + URL tạm, thu hồi sau khi tải)", async () => {
    stub(route);
    const u = userEvent.setup();
    const createObjectURL = vi.fn<(b: unknown) => string>(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<TwoFactorSection />);
    await toCodes(u);
    await u.click(screen.getByRole("button", { name: "Tải về (.txt)" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as { type: string; size: number };
    expect(blob.type).toContain("text/plain");
    expect(blob.size).toBeGreaterThan(CODES.join("\n").length);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    click.mockRestore();
  });
});

describe("TwoFactorSection: đã bật", () => {
  beforeEach(() => {
    current = makeUser({ role: "STAFF", twoFactorEnabled: true });
  });

  it("tắt: cần mật khẩu + mã; gửi đúng body; tải lại hồ sơ và báo thành công", async () => {
    const mock = stub(() => jsonRes(204));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" })); // gửi form trống
    expect(await screen.findByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();

    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText("Mã xác thực hoặc mã dự phòng"), "123 456");
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    await waitFor(() => expect(reloadUser).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock, 0)).toEqual({ password: "Matkhau123", code: "123456" });
    expect(await screen.findByText(/Đã tắt xác thực 2 lớp/)).toBeInTheDocument();
  });

  it("tắt bằng mã dự phòng giữ nguyên chuỗi mã", async () => {
    const mock = stub(() => jsonRes(204));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText("Mã xác thực hoặc mã dự phòng"), "ABCDE-FGHJK");
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    await waitFor(() => expect(reloadUser).toHaveBeenCalled());
    expect(bodyOf(mock, 0)).toEqual({ password: "Matkhau123", code: "ABCDE-FGHJK" });
  });

  it("lỗi: sai mật khẩu -> ô mật khẩu; sai mã -> ô mã; không tải lại hồ sơ", async () => {
    let n = 0;
    stub(() =>
      n++ === 0 ? errRes(400, "INVALID_PASSWORD", "x") : errRes(400, "TWO_FACTOR_INVALID", "x"),
    );
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Sai-mat-khau1");
    await u.type(screen.getByLabelText("Mã xác thực hoặc mã dự phòng"), "123456");
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    expect(await screen.findByText("Mật khẩu không đúng")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Tắt xác thực 2 lớp" }));
    expect(await screen.findByText("Mã không đúng hoặc đã được sử dụng")).toBeInTheDocument();
    expect(reloadUser).not.toHaveBeenCalled();
  });

  it("tạo lại mã dự phòng: hiện bộ mã mới một lần rồi hoàn tất", async () => {
    const mock = stub(() => jsonRes(200, { data: { backupCodes: CODES } }));
    const u = userEvent.setup();
    render(<TwoFactorSection />);
    await u.click(screen.getByRole("button", { name: "Tạo lại mã dự phòng" }));
    await u.type(screen.getByLabelText("Mật khẩu hiện tại"), "Matkhau123");
    await u.type(screen.getByLabelText("Mã xác thực hoặc mã dự phòng"), "654321");
    await u.click(screen.getByRole("button", { name: "Tạo mã dự phòng mới" }));
    expect(await screen.findAllByTestId("backup-code")).toHaveLength(10);
    expect(String(mock.mock.calls[0]![0])).toContain("/me/2fa/backup-codes");
    expect(bodyOf(mock, 0)).toEqual({ password: "Matkhau123", code: "654321" });
    await u.click(screen.getByLabelText(/Tôi đã lưu/));
    await u.click(screen.getByRole("button", { name: "Hoàn tất" }));
    expect(await screen.findByText(/Đã tạo lại mã dự phòng/)).toBeInTheDocument();
    expect(screen.queryByTestId("backup-code")).toBeNull();
  });
});
