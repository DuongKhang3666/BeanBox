import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { DEFAULT_PUBLIC_SETTINGS } from "../publicSettingsDefaults";
import { ContactForm } from "./ContactForm";

let authUser: ReturnType<typeof makeUser> | null = null;
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: authUser ? "authenticated" : "anonymous", user: authUser }),
}));

// Phản hồi của GET /settings/public (captcha phía server); null = tắt, "fail" = lỗi mạng.
let serverCaptcha: { provider: "turnstile"; siteKey: string } | null | "fail" = null;
const settingsCalls = vi.fn();

/** Trả mock chỉ đếm các request tới /contact; /settings/public được xử lý riêng. */
function stub(res: () => Response = () => jsonRes(201, { data: { received: true } })) {
  const contact = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => res());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/settings/public")) {
        settingsCalls();
        if (serverCaptcha === "fail") throw new TypeError("network");
        return jsonRes(200, {
          data: { ...DEFAULT_PUBLIC_SETTINGS, contactCaptcha: serverCaptcha },
        });
      }
      return contact(url, init);
    }),
  );
  return contact;
}

const MSG = "Cho mình hỏi về máy xay cà phê nhé.";

beforeEach(() => {
  authUser = null;
  serverCaptcha = null;
  settingsCalls.mockClear();
  tokenStore.clear();
  stub();
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

  describe("captcha Turnstile (D-028)", () => {
    interface Opts {
      sitekey: string;
      callback: (t: string) => void;
      "expired-callback": () => void;
    }
    let opts: Opts;
    const turnstile = {
      render: vi.fn((_el: HTMLElement, o: Opts) => {
        opts = o;
        return "widget-1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    beforeEach(() => {
      turnstile.render.mockClear();
      turnstile.reset.mockClear();
      turnstile.remove.mockClear();
      // Mặc định API khớp giá trị SSR dùng trong hầu hết test bên dưới.
      serverCaptcha = { provider: "turnstile", siteKey: "test-site-key" };
      (window as unknown as { turnstile?: unknown }).turnstile = turnstile;
    });
    afterEach(() => {
      delete (window as unknown as { turnstile?: unknown }).turnstile;
    });

    async function fill(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText("Họ và tên"), "Bình");
      await user.type(screen.getByLabelText("Email"), "binh@example.com");
      await user.type(screen.getByLabelText("Nội dung"), MSG);
    }

    it("tắt (null): không render widget, không tải script, nút bật sẵn", () => {
      serverCaptcha = null;
      render(<ContactForm captcha={null} />);
      expect(turnstile.render).not.toHaveBeenCalled();
      expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
      expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeEnabled();
    });

    it("bật: nút vô hiệu tới khi có token, body có captchaToken; token hết hạn thì vô hiệu lại", async () => {
      const mock = stub();
      const user = userEvent.setup();
      render(<ContactForm captcha={{ provider: "turnstile", siteKey: "test-site-key" }} />);
      await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
      expect(opts.sitekey).toBe("test-site-key");
      const btn = screen.getByRole("button", { name: "Gửi tin nhắn" });
      expect(btn).toBeDisabled();

      act(() => opts.callback("tok-abc"));
      expect(btn).toBeEnabled();
      act(() => opts["expired-callback"]());
      expect(btn).toBeDisabled();
      act(() => opts.callback("tok-abc"));

      await fill(user);
      await user.click(btn);
      await screen.findByText(/Cảm ơn bạn!/);
      expect(JSON.parse(mock.mock.calls[0]![1]!.body as string).captchaToken).toBe("tok-abc");
    });

    it("CAPTCHA_FAILED: báo lỗi tiếng Việt, reset widget, giữ dữ liệu, nút vô hiệu tới token mới", async () => {
      stub(() => errRes(400, "CAPTCHA_FAILED"));
      const user = userEvent.setup();
      render(<ContactForm captcha={{ provider: "turnstile", siteKey: "test-site-key" }} />);
      await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
      act(() => opts.callback("tok-1"));
      await fill(user);
      await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Xác minh chưa thành công");
      expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
      expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeDisabled();
      expect(screen.getByLabelText("Nội dung")).toHaveValue(MSG);
    });

    it("503: báo chưa xác minh được, thử lại sau", async () => {
      stub(() => errRes(503, "SERVICE_UNAVAILABLE"));
      const user = userEvent.setup();
      render(<ContactForm captcha={{ provider: "turnstile", siteKey: "test-site-key" }} />);
      await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
      act(() => opts.callback("tok-1"));
      await fill(user);
      await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("chưa xác minh được");
      expect(turnstile.reset).toHaveBeenCalled();
    });

    it("mount: SSR null nhưng API đã bật captcha -> hiện widget, nút vô hiệu", async () => {
      serverCaptcha = { provider: "turnstile", siteKey: "fresh-key" };
      render(<ContactForm captcha={null} />);
      await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
      expect(opts.sitekey).toBe("fresh-key");
      expect(settingsCalls).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeDisabled();
    });

    it("mount: SSR bật nhưng API đã tắt -> bỏ widget, nút bật", async () => {
      serverCaptcha = null;
      render(<ContactForm captcha={{ provider: "turnstile", siteKey: "old-key" }} />);
      await waitFor(() => expect(settingsCalls).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeEnabled(),
      );
      expect(turnstile.remove).toHaveBeenCalled();
    });

    it("mount: lỗi mạng khi lấy settings -> giữ giá trị SSR, không hiện lỗi", async () => {
      serverCaptcha = "fail";
      render(<ContactForm captcha={{ provider: "turnstile", siteKey: "ssr-key" }} />);
      await waitFor(() => expect(settingsCalls).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
      expect(opts.sitekey).toBe("ssr-key");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(turnstile.remove).not.toHaveBeenCalled();
    });

    it("CAPTCHA_FAILED khi form đang tắt captcha: gọi lại settings và bật widget", async () => {
      serverCaptcha = null;
      const contact = stub(() => errRes(400, "CAPTCHA_FAILED"));
      const user = userEvent.setup();
      render(<ContactForm captcha={null} />);
      await waitFor(() => expect(settingsCalls).toHaveBeenCalledTimes(1));
      await fill(user);
      serverCaptcha = { provider: "turnstile", siteKey: "late-key" };
      await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      expect(contact).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
      expect(opts.sitekey).toBe("late-key");
      expect(settingsCalls).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Gửi tin nhắn" })).toBeDisabled();
      expect(screen.getByLabelText("Nội dung")).toHaveValue(MSG);
    });

    it("dọn widget khi unmount", async () => {
      const { unmount } = render(
        <ContactForm captcha={{ provider: "turnstile", siteKey: "test-site-key" }} />,
      );
      await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
      unmount();
      expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    });
  });
});
