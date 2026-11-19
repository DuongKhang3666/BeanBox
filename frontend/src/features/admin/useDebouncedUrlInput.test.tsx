import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";
import { useState } from "react";
import { useDebouncedUrlInput } from "./useDebouncedUrlInput";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const commit = vi.fn();

function Harness() {
  const [q, setQ] = useState("");
  useDebouncedUrlInput(q, "", commit, (t) => t.length === 1);
  return (
    <div>
      <input aria-label="q" value={q} onChange={(e) => setQ(e.target.value)} />
      <Link href="/admin/lien-he/abc">chi tiết</Link>
      <a href="https://example.org/x" onClick={(e) => e.preventDefault()}>
        ngoài
      </a>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  commit.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useDebouncedUrlInput", () => {
  it("commit sau 400 ms", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "abc" } });
    act(() => void vi.advanceTimersByTime(399));
    expect(commit).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledWith("abc");
  });

  it("bỏ qua giá trị bị shouldSkip", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "a" } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
  });

  it("bấm link nội bộ khi đang chờ: hủy commit (không ghi đè điều hướng)", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "abc" } });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByText("chi tiết"), { button: 0 });
    act(() => void vi.advanceTimersByTime(2000));
    expect(commit).not.toHaveBeenCalled();
  });

  it("sau khi bấm link, gõ tiếp thì bật lại", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("chi tiết"), { button: 0 });
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "abcd" } });
    act(() => void vi.advanceTimersByTime(400));
    expect(commit).toHaveBeenCalledWith("abcd");
  });

  it("link sang domain khác không hủy", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("ngoài"), { button: 0 });
    act(() => void vi.advanceTimersByTime(400));
    expect(commit).toHaveBeenCalledWith("abc");
  });
});
