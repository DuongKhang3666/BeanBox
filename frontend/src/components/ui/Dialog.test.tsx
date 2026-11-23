import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function Harness({ busy = false, onClosed }: { busy?: boolean; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Mở</button>
      {open ? (
        <Dialog
          title="Tiêu đề thử"
          description="Mô tả thử"
          busy={busy}
          closeLabel="Đóng hộp"
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
        >
          <input aria-label="Ô nhập" />
          <button data-autofocus>Nút chính</button>
        </Dialog>
      ) : null}
    </>
  );
}

describe("Dialog", () => {
  it("mở bằng showModal, có tiêu đề và mô tả gắn aria, focus vào data-autofocus", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Mở" }));
    const dialog = screen.getByRole("dialog", { name: "Tiêu đề thử" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Mô tả thử");
    expect(screen.getByRole("button", { name: "Nút chính" })).toHaveFocus();
  });

  it("không có data-autofocus thì focus phần tử tương tác đầu tiên; container thì focus chính hộp", () => {
    const { unmount } = render(
      <Dialog title="A" onClose={() => {}}>
        <input aria-label="Một" />
      </Dialog>,
    );
    expect(screen.getByLabelText("Một")).toHaveFocus();
    unmount();
    render(
      <Dialog title="B" initialFocus="container" onClose={() => {}}>
        <input aria-label="Hai" />
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("Escape đóng, trả focus về nút đã mở", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    const opener = screen.getByRole("button", { name: "Mở" });
    opener.focus();
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("nút đóng có nhãn đóng hộp", async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở" }));
    await userEvent.click(screen.getByRole("button", { name: "Đóng hộp" }));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("đang bận thì Escape và nút đóng không đóng hộp", async () => {
    const onClosed = vi.fn();
    render(<Harness busy onClosed={onClosed} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Đóng hộp" }));
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sự kiện cancel của trình duyệt bị chặn và chuyển thành yêu cầu đóng", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="A" onClose={onClose}>
        <button>x</button>
      </Dialog>,
    );
    const ev = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("khóa cuộn nền theo bộ đếm: hộp lồng nhau chỉ nhả khi đóng hết, Escape chỉ đóng hộp trên cùng", async () => {
    document.body.style.overflow = "";
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(
      <>
        <Dialog title="Ngoài" onClose={outer}>
          <button>a</button>
        </Dialog>
        <Dialog title="Trong" onClose={inner}>
          <button>b</button>
        </Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    rerender(
      <Dialog title="Ngoài" onClose={outer}>
        <button>a</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<div />);
    expect(document.body.style.overflow).toBe("");
  });

  it("drawer: click nền (chính phần tử dialog) đóng, click nội dung thì không", async () => {
    const onClose = vi.fn();
    render(
      <Dialog variant="drawer" labelledBy="t" closeOnBackdrop onClose={onClose} testId="nen">
        <div>
          <h2 id="t">Ngăn kéo</h2>
          <button>Trong</button>
        </div>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Trong" }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("nen"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Ngăn kéo" })).toBeInTheDocument();
  });

  it("close do trình duyệt: đang bận thì mở lại, không bận thì báo đóng", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog title="A" busy onClose={onClose}>
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    dialog.close();
    expect(dialog).toHaveAttribute("open");
    expect(onClose).not.toHaveBeenCalled();
    rerender(
      <Dialog title="A" onClose={onClose}>
        <button>x</button>
      </Dialog>,
    );
    dialog.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("StrictMode (mount, cleanup, mount lại): hộp vẫn mở và sự kiện close muộn của lần đóng cũ bị bỏ qua", () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Dialog title="A" onClose={onClose}>
          <button>x</button>
        </Dialog>
      </StrictMode>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    // Trình duyệt thật phát `close` bất đồng bộ sau lần đóng do cleanup, lúc hộp đã mở lại.
    dialog.dispatchEvent(new Event("close"));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("open");
  });
});
