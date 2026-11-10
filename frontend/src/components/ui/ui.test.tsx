import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

describe("Button", () => {
  it("loading: bị vô hiệu hóa, aria-busy và không gọi onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Đặt hàng
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Đặt hàng" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled: không gọi onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Lưu
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("bình thường: gọi onClick, mặc định type=button", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Thêm vào giỏ</Button>);
    const btn = screen.getByRole("button", { name: "Thêm vào giỏ" });
    expect(btn).toHaveAttribute("type", "button");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyState", () => {
  it("hiển thị tiêu đề, mô tả và hành động", () => {
    render(
      <EmptyState
        title="Giỏ hàng trống"
        description="Hãy thêm sản phẩm."
        action={<a href="/gio-hang">Mua sắm</a>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Giỏ hàng trống" })).toBeInTheDocument();
    expect(screen.getByText("Hãy thêm sản phẩm.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mua sắm" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("có role alert và nút thử lại gọi onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("không có nút khi không truyền onRetry", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
