import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { ContactForm } from "./ContactForm";

let authUser: ReturnType<typeof makeUser> | null = null;
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: authUser ? "authenticated" : "anonymous", user: authUser }),
}));

function stub(res: () => Response = () => jsonRes(201, { data: { received: true } })) {
  const mock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => res());
  vi.stubGlobal("fetch", mock);
  return mock;
}

const MSG = "Cho mình hỏi về máy xay cà phê nhé.";

beforeEach(() => {
  authUser = null;
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ContactForm", () => {
  it("honeypot nằm ngoài màn hình, tabIndex -1, aria-hidden, autocomplete off", () => {
    render(<ContactForm />);
    const hp = screen.getByLabelText("Website (để trống)");
    expect(hp).toHaveAttribute("tabindex", "-1");
    expect(hp).toHaveAttribute("aria-hidden", "true");
    expect(hp).toHaveAttribute("autocomplete", "off");
    expect(hp.parentElement!.className).toContain("-left-[9999px]");
    expect(hp.parentElement!.className).not.toContain("hidden ");
  });

  it("validate client: báo lỗi từng ô, aria-invalid, không gọi API", async () => {
    const mock = stub();
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Email"), "khong-hop-le");
    await user.type(screen.getByLabelText("Số điện thoại (không bắt buộc)"), "123");
    await user.type(screen.getByLabelText("Nội dung"), "ngắn");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(screen.getByText("Vui lòng nhập họ tên")).toBeInTheDocument();
    expect(screen.getByText("Email không đúng định dạng")).toBeInTheDocument();
    expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByText("Nội dung tối thiểu 10 ký tự")).toBeInTheDocument();
    expect(screen.getByLabelText("Họ và tên")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nội dung")).toHaveAttribute("aria-invalid", "true");
    expect(mock).not.toHaveBeenCalled();
  });

  it("đếm ký tự nội dung", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Nội dung"), "abc");
    expect(screen.getByText(/3\/2000 ký tự/)).toBeInTheDocument();
  });

  it("gửi đúng body (website rỗng, chuẩn hóa email/SĐT), rồi hiện thông báo thành công và gửi tiếp được", async () => {
    const mock = stub();
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Họ và tên"), "  Trần Thị Bình ");
    await user.type(screen.getByLabelText("Email"), "Binh@Example.com");
    await user.type(screen.getByLabelText("Số điện thoại (không bắt buộc)"), "+84 901 234 567");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    await screen.findByText(/Cảm ơn bạn! BeanBox đã nhận được tin nhắn/);
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/contact");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Trần Thị Bình",
      email: "binh@example.com",
      phone: "0901234567",
      message: MSG,
      website: "",
    });

    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn khác" }));
    expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeInTheDocument();
  });

  it("gửi giá trị honeypot nguyên trạng", async () => {
    const mock = stub();
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Họ và tên"), "Bình");
    await user.type(screen.getByLabelText("Email"), "binh@example.com");
    await user.type(screen.getByLabelText("Website (để trống)"), "http://spam.example");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await screen.findByText(/Cảm ơn bạn!/);
    const init = mock.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string).website).toBe("http://spam.example");
  });

  it("429: báo gửi quá nhiều, giữ nguyên dữ liệu", async () => {
    stub(() => errRes(429, "RATE_LIMITED"));
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Họ và tên"), "Bình");
    await user.type(screen.getByLabelText("Email"), "binh@example.com");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn đã gửi quá nhiều tin nhắn, vui lòng thử lại sau ít phút.",
    );
    expect(screen.getByLabelText("Nội dung")).toHaveValue(MSG);
  });

  it("5xx: thông báo chung, giữ dữ liệu", async () => {
    stub(() => errRes(500, "INTERNAL_ERROR"));
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Họ và tên"), "Bình");
    await user.type(screen.getByLabelText("Email"), "binh@example.com");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không gửi được tin nhắn");
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("Bình");
    expect(screen.getByLabelText("Nội dung")).toHaveValue(MSG);
  });

  it("400 từ server: map details[].field về ô tương ứng", async () => {
    stub(() =>
      errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
        { field: "email", message: "Email không hợp lệ (server)" },
      ]),
    );
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Họ và tên"), "Bình");
    await user.type(screen.getByLabelText("Email"), "binh@example.com");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await waitFor(() =>
      expect(screen.getByText("Email không hợp lệ (server)")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email").getAttribute("aria-describedby")).toContain(
      "email-error",
    );
  });

  it("đã đăng nhập: điền sẵn họ tên/email, sửa được, gắn Bearer", async () => {
    authUser = makeUser({ fullName: "Nguyễn Văn An", email: "an@example.com" });
    tokenStore.set("tok123");
    const mock = stub();
    const user = userEvent.setup();
    render(<ContactForm />);
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Văn An");
    expect(screen.getByLabelText("Email")).toHaveValue("an@example.com");
    await user.clear(screen.getByLabelText("Họ và tên"));
    await user.type(screen.getByLabelText("Họ và tên"), "An Nguyễn");
    await user.type(screen.getByLabelText("Nội dung"), MSG);
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await screen.findByText(/Cảm ơn bạn!/);
    const init = mock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "An Nguyễn",
      email: "an@example.com",
    });
  });

  it("có liên kết tới chính sách bảo mật", () => {
    render(<ContactForm />);
    expect(screen.getByRole("link", { name: "chính sách bảo mật" })).toHaveAttribute(
      "href",
      "/chinh-sach/bao-mat",
    );
  });
});
