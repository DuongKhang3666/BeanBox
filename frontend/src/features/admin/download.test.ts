import { afterEach, describe, expect, it, vi } from "vitest";
import { saveBlob } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("saveBlob", () => {
  it("tạo object URL, bấm <a download>, gỡ phần tử và thu hồi URL", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:http://localhost/abc");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let inDomOnClick = false;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      inDomOnClick = document.body.contains(this);
    });
    const blob = new Blob(["x"], { type: "text/csv" });
    saveBlob(blob, "beanbox-overview-2026-10-22_2026-11-20.csv");
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(inDomOnClick).toBe(true);
    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(clicked.download).toBe("beanbox-overview-2026-10-22_2026-11-20.csv");
    expect(clicked.getAttribute("href")).toBe("blob:http://localhost/abc");
    expect(document.body.contains(clicked)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:http://localhost/abc");
  });
});
