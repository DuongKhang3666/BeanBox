import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LocationCombobox } from "./LocationCombobox";

const OPTIONS = [
  { code: "01", name: "Thành phố Hà Nội" },
  { code: "79", name: "Thành phố Hồ Chí Minh" },
  { code: "48", name: "Thành phố Đà Nẵng" },
];

function Harness({ onChange }: { onChange?: (c: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <LocationCombobox
      id="provinceCode"
      label="Tỉnh/thành"
      options={OPTIONS}
      value={value}
      onChange={(c) => {
        setValue(c);
        onChange?.(c);
      }}
    />
  );
}

const box = () => screen.getByRole("combobox", { name: "Tỉnh/thành" });

describe("LocationCombobox", () => {
  it("có thuộc tính ARIA combobox", async () => {
    const u = userEvent.setup();
    render(<Harness />);
    expect(box()).toHaveAttribute("aria-autocomplete", "list");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(box()).toHaveAttribute("aria-controls", "provinceCode-listbox");
    await u.click(box());
    expect(box()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(box()).toHaveAttribute("aria-activedescendant", "provinceCode-opt-01");
  });

  it("lọc không dấu và hiển thị trạng thái rỗng", async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await u.type(box(), "ha noi");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Thành phố Hà Nội"]);
    await u.clear(box());
    await u.type(box(), "da nang");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Thành phố Đà Nẵng"]);
    await u.clear(box());
    await u.type(box(), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Không tìm thấy kết quả")).toBeInTheDocument();
  });

  it("chọn bằng bàn phím: mũi tên + Enter", async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await u.click(box());
    await u.keyboard("{ArrowDown}{ArrowDown}");
    expect(box()).toHaveAttribute("aria-activedescendant", "provinceCode-opt-48");
    await u.keyboard("{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledWith("79");
    expect(box()).toHaveValue("Thành phố Hồ Chí Minh");
    expect(box()).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape đóng và trả lại tên đã chọn; blur cũng vậy", async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await u.type(box(), "ha noi{Enter}");
    expect(box()).toHaveValue("Thành phố Hà Nội");
    await u.clear(box());
    await u.type(box(), "xyz");
    await u.keyboard("{Escape}");
    expect(box()).toHaveValue("Thành phố Hà Nội");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    await u.type(box(), "abc");
    await u.tab();
    expect(box()).toHaveValue("Thành phố Hà Nội");
  });

  it("click option chọn được; aria-invalid + aria-describedby khi lỗi", async () => {
    const u = userEvent.setup();
    const { rerender } = render(<Harness />);
    await u.click(box());
    await u.click(screen.getByRole("option", { name: "Thành phố Đà Nẵng" }));
    expect(box()).toHaveValue("Thành phố Đà Nẵng");
    rerender(
      <LocationCombobox
        id="provinceCode"
        label="Tỉnh/thành"
        options={OPTIONS}
        value=""
        onChange={() => {}}
        error="Vui lòng chọn tỉnh/thành"
      />,
    );
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(box()).toHaveAccessibleDescription("Vui lòng chọn tỉnh/thành");
  });
});
