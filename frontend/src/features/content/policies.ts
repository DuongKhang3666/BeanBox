import { formatVND } from "@/lib/format";
import { DEFAULT_PUBLIC_SETTINGS } from "./publicSettingsDefaults";
import type { PublicSettings } from "@/types/settings";

export const POLICY_SLUGS = ["van-chuyen", "doi-tra", "bao-mat", "dieu-khoan"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export const DEMO_NOTICE =
  "BeanBox là dự án demo phục vụ học tập/portfolio; không có giao dịch hay giao hàng thật.";

export const POLICY_UPDATED_AT = "19/11/2026";

export interface PolicySection {
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
}

export interface Policy {
  slug: PolicySlug;
  /** Tên ngắn dùng cho mục lục và liên kết chéo. */
  shortTitle: string;
  title: string;
  description: string;
  updatedAt: string;
  intro: string;
  sections: readonly PolicySection[];
}

/** "A", "A và B", "A, B và C". */
function joinNatural(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`;
}

/** 2000 -> "2", 1500 -> "1,5" (số kg gọn, dấu phẩy thập phân). */
export function formatKg(gram: number): string {
  return String(Number((gram / 1000).toFixed(3))).replace(".", ",");
}

function buildShipping(settings: PublicSettings): Policy {
  const { rates, freeShippingThreshold, weightSurcharge, innerCityProvinces, innerCityWardCount } =
    settings.shipping;
  const names = innerCityProvinces.map((p) => p.name);
  const hasWards = innerCityWardCount > 0;
  const hasInner = names.length > 0 || hasWards;

  let innerText: string;
  if (names.length > 0) {
    innerText = `Nội thành gồm ${joinNatural(names)}${hasWards ? " và một số phường/xã được cửa hàng cấu hình riêng" : ""} (theo đơn vị hành chính hiện hành).`;
  } else if (hasWards) {
    innerText =
      "Nội thành gồm một số phường/xã được cửa hàng cấu hình riêng (theo đơn vị hành chính hiện hành).";
  } else {
    innerText =
      "Hiện không có khu vực nội thành riêng; mọi địa chỉ được tính theo mức của tỉnh/thành khác.";
  }

  const rateLine = (area: string, r: { STANDARD: number; EXPRESS: number }) =>
    `${area}: Tiêu chuẩn ${formatVND(r.STANDARD)} (3–5 ngày), Nhanh ${formatVND(r.EXPRESS)} (1–2 ngày).`;
  const bullets = [
    ...(hasInner ? [rateLine("Nội thành", rates.inner)] : []),
    rateLine(hasInner ? "Tỉnh/thành khác" : "Mọi tỉnh/thành", rates.other),
  ];

  const freeText =
    freeShippingThreshold === 0
      ? "Mọi đơn dùng phương thức Tiêu chuẩn đều được miễn phí vận chuyển, bao gồm cả phụ phí khối lượng. Phương thức Nhanh không áp dụng ưu đãi này."
      : `Đơn từ ${formatVND(freeShippingThreshold)} (tính sau khi trừ giảm giá) được miễn phí vận chuyển Tiêu chuẩn, bao gồm cả phụ phí khối lượng. Phương thức Nhanh không áp dụng ưu đãi này.`;

  const surchargeText =
    weightSurcharge.feePerStep === 0
      ? "Hiện không có phụ phí khối lượng."
      : `Đơn nặng trên ${formatKg(weightSurcharge.freeGram)} kg phát sinh ${formatVND(weightSurcharge.feePerStep)} cho mỗi ${formatKg(weightSurcharge.stepGram)} kg hoặc phần lẻ vượt quá ${formatKg(weightSurcharge.freeGram)} kg.`;

  return {
    slug: "van-chuyen",
    shortTitle: "Vận chuyển",
    title: "Chính sách vận chuyển",
    description:
      "Phí vận chuyển, thời gian giao hàng ước tính và điều kiện miễn phí vận chuyển tại BeanBox.",
    updatedAt: POLICY_UPDATED_AT,
    intro: "Trang này mô tả cách BeanBox tính phí và thời gian giao hàng cho đơn đặt trên website.",
    sections: [
      {
        id: "phi-van-chuyen",
        heading: "Phí vận chuyển",
        paragraphs: [
          `Phí được tính theo khu vực nhận hàng và phương thức vận chuyển bạn chọn. ${innerText}`,
        ],
        bullets,
      },
      { id: "mien-phi", heading: "Miễn phí vận chuyển", paragraphs: [freeText] },
      { id: "phu-phi-khoi-luong", heading: "Phụ phí khối lượng", paragraphs: [surchargeText] },
      {
        id: "thoi-gian",
        heading: "Thời gian giao hàng",
        paragraphs: [
          "Thời gian ở trên là ước tính, tính từ lúc cửa hàng bàn giao cho đơn vị vận chuyển, và có thể thay đổi do thời tiết hoặc dịp lễ.",
          "Phí vận chuyển cuối cùng được hiển thị ở bước thanh toán, trước khi bạn bấm đặt hàng.",
        ],
      },
    ],
  };
}

function buildReturns(email: string): Policy {
  return {
    slug: "doi-tra",
    shortTitle: "Đổi trả",
    title: "Chính sách đổi trả và hủy đơn",
    description: "Quy định đổi trả, hoàn tiền và cách hủy đơn hàng tại BeanBox.",
    updatedAt: POLICY_UPDATED_AT,
    intro: "Trang này nêu cách xử lý khi hàng có vấn đề và cách hủy đơn.",
    sections: [
      {
        id: "doi-tra",
        heading: "Đổi trả",
        paragraphs: [
          "BeanBox chưa hỗ trợ yêu cầu đổi trả trực tuyến. Nếu hàng bị lỗi, giao sai hoặc thiếu, vui lòng báo qua email trong vòng 7 ngày kể từ khi nhận hàng.",
        ],
        bullets: [
          `Gửi email tới ${email}.`,
          "Ghi rõ mã đơn và đính kèm ảnh sản phẩm, bao bì để cửa hàng kiểm tra.",
          "Cà phê hạt đã mở bao không được đổi trả, trừ trường hợp lỗi chất lượng.",
        ],
      },
      {
        id: "hoan-tien",
        heading: "Hoàn tiền",
        paragraphs: [
          "Khi yêu cầu được chấp nhận, cửa hàng hoàn tiền thủ công và thông báo cho bạn qua email.",
        ],
      },
      {
        id: "huy-don",
        heading: "Hủy đơn",
        paragraphs: [
          "Bạn có thể tự hủy đơn khi đơn đang ở trạng thái Chờ thanh toán, Chờ xác nhận hoặc Đã xác nhận.",
        ],
        bullets: [
          "Khách có tài khoản: hủy trong mục Đơn hàng của tôi.",
          "Khách vãng lai: hủy tại trang Tra cứu đơn hàng bằng mã đơn và số điện thoại đặt hàng.",
          `Từ lúc đơn bắt đầu được đóng gói, vui lòng liên hệ cửa hàng qua ${email}.`,
        ],
      },
    ],
  };
}

function buildPrivacy(email: string): Policy {
  return {
    slug: "bao-mat",
    shortTitle: "Bảo mật",
    title: "Chính sách bảo mật",
    description: "BeanBox thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn như thế nào.",
    updatedAt: POLICY_UPDATED_AT,
    intro:
      "Trang này giải thích dữ liệu nào được thu thập, dùng để làm gì và bạn có những quyền gì.",
    sections: [
      {
        id: "du-lieu-thu-thap",
        heading: "Dữ liệu chúng tôi thu thập",
        bullets: [
          "Họ tên, email và số điện thoại.",
          "Địa chỉ giao hàng.",
          "Lịch sử đơn hàng.",
          "Nội dung bạn gửi qua form liên hệ (họ tên, email, số điện thoại nếu có và nội dung tin nhắn).",
        ],
      },
      {
        id: "muc-dich",
        heading: "Mục đích sử dụng",
        bullets: [
          "Xử lý đơn hàng.",
          "Liên hệ khi giao hàng.",
          "Gửi email xác nhận và cập nhật trạng thái đơn.",
          "Phản hồi tin nhắn bạn gửi qua form liên hệ; nội dung này được lưu để cửa hàng xử lý yêu cầu.",
        ],
        paragraphs: [
          "BeanBox không lưu địa chỉ IP của bạn khi bạn gửi form liên hệ.",
          "BeanBox không bán hay chia sẻ dữ liệu của bạn cho bên thứ ba ngoài mục đích giao hàng.",
        ],
      },
      {
        id: "bao-ve",
        heading: "Cách chúng tôi bảo vệ tài khoản",
        bullets: [
          "Mật khẩu được băm, không lưu dưới dạng văn bản gốc.",
          "Phiên đăng nhập dùng cookie httpOnly.",
          "Giỏ hàng của khách vãng lai lưu mã giỏ trong trình duyệt (localStorage) để giữ giỏ giữa các lần truy cập.",
        ],
      },
      {
        id: "quyen-cua-ban",
        heading: "Quyền của bạn",
        paragraphs: [
          `Bạn có thể yêu cầu xem hoặc xóa dữ liệu cá nhân bằng cách gửi email tới ${email}.`,
        ],
      },
    ],
  };
}

function buildTerms(settings: PublicSettings): Policy {
  return {
    slug: "dieu-khoan",
    shortTitle: "Điều khoản mua hàng",
    title: "Điều khoản mua hàng",
    description: "Điều khoản áp dụng khi mua hàng trên website BeanBox.",
    updatedAt: POLICY_UPDATED_AT,
    intro: "Khi đặt hàng trên BeanBox, bạn đồng ý với các điều khoản dưới đây.",
    sections: [
      {
        id: "pham-vi",
        heading: "Phạm vi áp dụng",
        paragraphs: [
          "Điều khoản này áp dụng cho mọi đơn hàng đặt qua website BeanBox, dù bạn có tài khoản hay mua với tư cách khách vãng lai.",
        ],
      },
      {
        id: "gia-va-ton-kho",
        heading: "Giá và tồn kho",
        paragraphs: [
          "Giá niêm yết bằng VND và đã bao gồm VAT. Giá và tồn kho được kiểm tra lại tại thời điểm đặt hàng, nên hệ thống có thể báo thay đổi giá hoặc hết hàng.",
        ],
      },
      {
        id: "xac-nhan-thanh-toan",
        heading: "Xác nhận đơn và thanh toán",
        paragraphs: [
          "Đơn thanh toán khi nhận hàng (COD) được cửa hàng xác nhận sau khi đặt.",
          `Thanh toán trực tuyến (VNPay, thẻ qua Stripe, ở chế độ thử nghiệm của dự án demo) cần hoàn tất trong ${settings.order.paymentExpiryMinutes} phút kể từ lúc đặt đơn; quá hạn đơn sẽ tự động hủy.`,
        ],
      },
      {
        id: "ma-giam-gia",
        heading: "Mã giảm giá",
        paragraphs: [
          "Mỗi đơn chỉ áp dụng một mã giảm giá. Mỗi mã có điều kiện riêng như giá trị đơn tối thiểu, thời gian hiệu lực và số lượt dùng.",
        ],
      },
      {
        id: "huy-boi-cua-hang",
        heading: "Cửa hàng hủy đơn",
        paragraphs: [
          "Cửa hàng có thể hủy đơn khi hết hàng hoặc có sai sót về giá, thông tin sản phẩm. BeanBox sẽ thông báo cho bạn khi việc này xảy ra.",
        ],
      },
      {
        id: "khach-vang-lai",
        heading: "Khách vãng lai",
        paragraphs: [
          "Khách không có tài khoản tra cứu và hủy đơn bằng mã đơn cùng số điện thoại đặt hàng. Vui lòng giữ kỹ mã đơn trong email xác nhận.",
        ],
      },
      {
        id: "chinh-sach-lien-quan",
        heading: "Chính sách liên quan",
        paragraphs: [
          "Điều khoản này được đọc cùng chính sách vận chuyển, chính sách đổi trả và hủy đơn, và chính sách bảo mật của BeanBox.",
        ],
      },
    ],
  };
}

/** Hàm thuần: dựng nội dung 4 trang chính sách từ settings công khai. */
export function buildPolicies(settings: PublicSettings): Record<PolicySlug, Policy> {
  const email = settings.store.contact.email;
  return {
    "van-chuyen": buildShipping(settings),
    "doi-tra": buildReturns(email),
    "bao-mat": buildPrivacy(email),
    "dieu-khoan": buildTerms(settings),
  };
}

/** Bản dựng từ nội dung mặc định (tiêu đề/liên kết chéo không phụ thuộc settings). */
export const POLICIES: Record<PolicySlug, Policy> = buildPolicies(DEFAULT_PUBLIC_SETTINGS);

export function isPolicySlug(slug: string): slug is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(slug);
}
