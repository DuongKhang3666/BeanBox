import { describe, expect, it } from "vitest";
import { orderFiltersHref, parseOrderFilters } from "./orderFilters";

describe("orderFilters: transferClaimed và phương thức mới", () => {
  it("parse transferClaimed=true; giá trị khác bị bỏ", () => {
    expect(parseOrderFilters(new URLSearchParams("transferClaimed=true"))).toEqual({
      transferClaimed: true,
    });
    expect(parseOrderFilters(new URLSearchParams("transferClaimed=1"))).toEqual({});
  });

  it("chấp nhận MOMO và BANK_TRANSFER, bỏ phương thức lạ", () => {
    expect(parseOrderFilters(new URLSearchParams("paymentMethod=MOMO")).paymentMethod).toBe("MOMO");
    expect(
      parseOrderFilters(new URLSearchParams("paymentMethod=BANK_TRANSFER")).paymentMethod,
    ).toBe("BANK_TRANSFER");
    expect(
      parseOrderFilters(new URLSearchParams("paymentMethod=PAYPAL")).paymentMethod,
    ).toBeUndefined();
  });

  it("href có transferClaimed", () => {
    expect(orderFiltersHref({ transferClaimed: true })).toContain("transferClaimed=true");
    expect(orderFiltersHref({})).not.toContain("transferClaimed");
  });
});
