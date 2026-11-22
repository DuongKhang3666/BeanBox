import { describe, expect, it } from "vitest";
import {
  areaDraft,
  bankDraft,
  bannersDraft,
  buildAreaPatch,
  buildBankPatch,
  buildBannersPatch,
  buildContactPatch,
  buildShippingPatch,
  contactDraft,
  emptyBanner,
  latestUpdatedAt,
  mapServerFieldErrors,
  shippingDraft,
  validateArea,
  validateBank,
  validateBanners,
  validateContact,
  validateShipping,
} from "./settingsForm";
import { makeAdminSettings } from "./testing";

describe("validateShipping", () => {
  it("giá trị mặc định hợp lệ và build đúng kiểu số", () => {
    const d = shippingDraft(makeAdminSettings());
    expect(validateShipping(d)).toEqual({});
    expect(buildShippingPatch(d)).toEqual({
      "shipping.rates": {
        inner: { STANDARD: 20000, EXPRESS: 35000 },
        other: { STANDARD: 35000, EXPRESS: 55000 },
      },
      "shipping.freeShippingThreshold": 500000,
      "shipping.weightSurcharge": { freeGram: 2000, stepGram: 1000, feePerStep: 5000 },
      "order.paymentExpiryMinutes": 15,
      "shipping.eta": makeAdminSettings()["shipping.eta"],
    });
  });

  it("eta (D-062): min > max, ngoài 0..30, không phải số nguyên -> lỗi theo field", () => {
    const base = shippingDraft(makeAdminSettings());
    const withEta = (over: Record<string, string>) => ({
      ...base,
      eta: { ...base.eta, ...over },
    });
    expect(validateShipping(withEta({ "inner.STANDARD.minDays": "3" }))).toEqual({
      "shipping.eta.inner.STANDARD.minDays": expect.stringContaining("không được lớn hơn"),
    });
    const e = validateShipping(
      withEta({
        "other.EXPRESS.minDays": "-1",
        "other.EXPRESS.maxDays": "31",
        "inner.EXPRESS.maxDays": "1.5",
        "other.STANDARD.minDays": "",
      }),
    );
    expect(Object.keys(e).sort()).toEqual(
      [
        "shipping.eta.other.EXPRESS.minDays",
        "shipping.eta.other.EXPRESS.maxDays",
        "shipping.eta.inner.EXPRESS.maxDays",
        "shipping.eta.other.STANDARD.minDays",
      ].sort(),
    );
    expect(
      validateShipping(withEta({ "inner.STANDARD.minDays": "30", "inner.STANDARD.maxDays": "30" })),
    ).toEqual({});
  });

  it("eta: build ra số nguyên theo vùng x phương thức", () => {
    const d = shippingDraft(makeAdminSettings());
    d.eta["other.STANDARD.maxDays"] = " 7 ";
    expect(buildShippingPatch(d)["shipping.eta"]?.other.STANDARD).toEqual({
      minDays: 3,
      maxDays: 7,
    });
  });

  it("từ chối ngoài khoảng, số thập phân, chữ, rỗng; báo theo đường dẫn field", () => {
    const d = {
      ...shippingDraft(makeAdminSettings()),
      innerStandard: "1000001",
      innerExpress: "12.5",
      otherStandard: "abc",
      otherExpress: "",
      threshold: "100000001",
      stepGram: "0",
      expiry: "4",
    };
    const e = validateShipping(d);
    expect(Object.keys(e).sort()).toEqual(
      [
        "shipping.rates.inner.STANDARD",
        "shipping.rates.inner.EXPRESS",
        "shipping.rates.other.STANDARD",
        "shipping.rates.other.EXPRESS",
        "shipping.freeShippingThreshold",
        "shipping.weightSurcharge.stepGram",
        "order.paymentExpiryMinutes",
      ].sort(),
    );
    expect(validateShipping({ ...d, expiry: "121" })["order.paymentExpiryMinutes"]).toMatch(
      /5 đến 120/,
    );
  });
});

describe("validateArea / buildAreaPatch", () => {
  it("mã phường phân cách bằng phẩy/xuống dòng, bỏ trùng", () => {
    const d = { provinces: ["01", "01", "79"], wards: "26740, 26741\n26740;26742" };
    expect(validateArea(d)).toEqual({});
    expect(buildAreaPatch(d)).toEqual({
      "shipping.innerCityProvinceCodes": ["01", "79"],
      "shipping.innerCityWardCodes": ["26740", "26741", "26742"],
    });
  });

  it("mã phường sai định dạng -> lỗi ở ô mã phường", () => {
    const e = validateArea({ provinces: [], wards: "26740, 123" });
    expect(e["shipping.innerCityWardCodes"]).toMatch(/123/);
    expect(areaDraft(makeAdminSettings()).wards).toBe("");
  });

  it("quá 500 mã -> lỗi", () => {
    const wards = Array.from({ length: 501 }, (_, i) => String(10000 + i)).join(",");
    expect(validateArea({ provinces: [], wards })["shipping.innerCityWardCodes"]).toMatch(/500/);
  });
});

describe("validateContact / buildContactPatch", () => {
  const ok = { name: "BeanBox", email: "Shop@Example.vn", phone: "", address: "" };
  it("hợp lệ: email lowercase, SĐT chuẩn hóa D-007, rỗng giữ rỗng", () => {
    expect(validateContact(ok)).toEqual({});
    expect(buildContactPatch({ ...ok, phone: "+84 901-234-567" })).toEqual({
      "store.contact": {
        name: "BeanBox",
        email: "shop@example.vn",
        phone: "0901234567",
        address: "",
      },
    });
    expect(contactDraft(makeAdminSettings()).email).toBe("hello@beanbox.local");
  });

  it("báo lỗi tên rỗng, email sai, SĐT sai, địa chỉ quá dài", () => {
    const e = validateContact({
      name: " ",
      email: "khong-hop-le",
      phone: "12345",
      address: "x".repeat(301),
    });
    expect(Object.keys(e).sort()).toEqual([
      "store.contact.address",
      "store.contact.email",
      "store.contact.name",
      "store.contact.phone",
    ]);
  });
});

describe("validateBanners / buildBannersPatch", () => {
  const good = () => ({
    ...emptyBanner(),
    imageUrl: "/uploads/a.webp",
    alt: "Mô tả",
    href: "/san-pham",
  });

  it("hợp lệ: href rỗng -> null; cắt khoảng trắng", () => {
    const list = [good(), { ...good(), href: "  ", title: " Tiêu đề " }];
    expect(validateBanners(list)).toEqual({});
    const patch = buildBannersPatch(list)["home.banners"]!;
    expect(patch[0]).toMatchObject({ href: "/san-pham", isActive: true });
    expect(patch[1]).toMatchObject({ href: null, title: "Tiêu đề" });
    expect(patch[0]).not.toHaveProperty("uid");
  });

  it("ảnh ngoài /uploads/, href ngoài, alt rỗng -> lỗi theo chỉ số", () => {
    const list = [
      good(),
      { ...good(), imageUrl: "https://evil.example/x.png", alt: "", href: "//evil.example" },
      { ...good(), imageUrl: "", href: "https://evil.example" },
    ];
    const e = validateBanners(list);
    expect(e["home.banners.0.imageUrl"]).toBeUndefined();
    expect(e["home.banners.1.imageUrl"]).toMatch(/\/uploads\//);
    expect(e["home.banners.1.alt"]).toBeDefined();
    expect(e["home.banners.1.href"]).toBeDefined();
    expect(e["home.banners.2.imageUrl"]).toBeDefined();
    expect(e["home.banners.2.href"]).toBeDefined();
  });

  it("quá 5 banner -> lỗi chung", () => {
    const list = Array.from({ length: 6 }, good);
    expect(validateBanners(list)["home.banners"]).toMatch(/5/);
  });

  it("bannersDraft cấp uid khác nhau và href null -> chuỗi rỗng", () => {
    const d = bannersDraft(
      makeAdminSettings({
        "home.banners": [
          {
            imageUrl: "/uploads/a.webp",
            alt: "A",
            title: "",
            subtitle: "",
            href: null,
            isActive: false,
          },
          {
            imageUrl: "/uploads/b.webp",
            alt: "B",
            title: "",
            subtitle: "",
            href: "/x",
            isActive: true,
          },
        ],
      }),
    );
    expect(d[0]!.uid).not.toBe(d[1]!.uid);
    expect(d[0]!.href).toBe("");
  });
});

describe("mapServerFieldErrors / latestUpdatedAt", () => {
  it("khớp chính xác, khớp field con, còn lại vào general", () => {
    const r = mapServerFieldErrors(
      {
        "shipping.rates.inner.STANDARD": "Quá lớn",
        "shipping.innerCityWardCodes.3": "Không tồn tại",
        "shipping.rates": "Sai",
      },
      ["shipping.rates.inner.STANDARD", "shipping.innerCityWardCodes"],
    );
    expect(r.fields).toEqual({
      "shipping.rates.inner.STANDARD": "Quá lớn",
      "shipping.innerCityWardCodes": "Không tồn tại",
    });
    expect(r.general).toEqual(["Sai"]);
  });

  it("lấy mốc cập nhật mới nhất, null nếu chưa có", () => {
    expect(
      latestUpdatedAt(["store.contact", "home.banners"], {
        "store.contact": "2026-11-10T01:00:00.000Z",
        "home.banners": "2026-11-12T01:00:00.000Z",
      }),
    ).toBe("2026-11-12T01:00:00.000Z");
    expect(latestUpdatedAt(["store.contact"], { "store.contact": null })).toBeNull();
  });
});

describe("chuyển khoản (D-061)", () => {
  it("mặc định hợp lệ; build cắt khoảng trắng", () => {
    const d = bankDraft(makeAdminSettings());
    expect(validateBank(d)).toEqual({});
    expect(
      buildBankPatch({ ...d, accountNo: " 0123456789 " })["payment.bankTransfer"],
    ).toMatchObject({
      accountNo: "0123456789",
      bankBin: "999999",
    });
  });

  it("từ chối BIN/số tài khoản sai và tên rỗng/quá dài/ký tự điều khiển", () => {
    const e = validateBank({
      bankBin: "12a",
      bankName: " ",
      accountNo: "123",
      accountName: "x".repeat(101),
    });
    expect(Object.keys(e).sort()).toEqual([
      "payment.bankTransfer.accountName",
      "payment.bankTransfer.accountNo",
      "payment.bankTransfer.bankBin",
      "payment.bankTransfer.bankName",
    ]);
    expect(
      validateBank({ ...bankDraft(makeAdminSettings()), bankName: "A\u0000B" }),
    ).toHaveProperty("payment.bankTransfer.bankName");
    expect(
      validateBank({ ...bankDraft(makeAdminSettings()), accountNo: "1".repeat(20) }),
    ).toHaveProperty("payment.bankTransfer.accountNo");
  });
});
