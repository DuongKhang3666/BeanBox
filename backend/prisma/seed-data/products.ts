/*
 * Dữ liệu mẫu cho môi trường dev.
 *
 * - Toàn bộ sản phẩm, mô tả, giá, tồn kho, số bán, điểm đánh giá ở đây là DỮ LIỆU GIẢ để thử giao diện/logic,
 *   không phải thông tin thương mại thật. Mô tả chỉ nêu thông tin chung, không đưa thông số kỹ thuật cụ thể.
 * - `weightGram` của dụng cụ/phụ kiện/quà tặng là số ước lượng làm tròn, chỉ dùng để thử phí vận chuyển.
 * - `stats` = [soldCount, ratingAvg, ratingCount]: giá trị giả, khác nhau để sắp xếp có kết quả.
 * - Module thuần dữ liệu (không chạm DB); việc ghi DB nằm ở seed-products.ts.
 * - Các ca kiểm thử cố định (không ngẫu nhiên): xem tests/seedData.test.ts.
 */

export type SaleWindow = 'ACTIVE' | 'EXPIRED' | 'UPCOMING';

export interface VariantSeed {
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  stock: number;
  weightGram: number;
  lowStockThreshold?: number;
  /** Cửa sổ sale tính tương đối từ thời điểm chạy seed. `price` của sale luôn < `price` niêm yết. */
  sale?: { price: number; window: SaleWindow };
}

export interface CoffeeSeed {
  originCountry: string;
  originRegion: string;
  variety: string;
  process: 'WASHED' | 'NATURAL' | 'HONEY' | 'ANAEROBIC' | 'OTHER';
  roastLevel: 'LIGHT' | 'MEDIUM' | 'MEDIUM_DARK' | 'DARK';
  /** Mét; null khi không có thông tin chắc chắn. */
  altitude: number | null;
  tastingNotes: string[];
  brewMethods: (
    | 'PHIN'
    | 'ESPRESSO'
    | 'POUR_OVER'
    | 'COLD_BREW'
    | 'FRENCH_PRESS'
    | 'AEROPRESS'
    | 'MOKA'
  )[];
  /** Ngày rang cách ngày chạy seed bao nhiêu ngày (0-29). */
  roastDaysAgo: number;
}

export interface ProductSeed {
  slug: string;
  name: string;
  categorySlug: string;
  brandSlug: string | null;
  shortDesc: string;
  description: string;
  tags: string[];
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  isFeatured: boolean;
  /** true = xóa mềm (đặt deletedAt lúc chạy seed). */
  deleted?: boolean;
  coffee?: CoffeeSeed;
  variants: VariantSeed[];
  stats: [soldCount: number, ratingAvg: number, ratingCount: number];
}

const GRIND = {
  WB: 'Nguyên hạt',
  PO: 'Xay pour-over',
  PHIN: 'Xay phin',
  ESP: 'Xay espresso',
  CB: 'Xay cold brew',
} as const;

/** Biến thể cà phê: gói `grams` gam, kiểu xay `grind`. SKU: <prefix>-<gam>-<kiểu xay>. */
function bean(
  prefix: string,
  grams: number,
  grind: keyof typeof GRIND,
  price: number,
  stock: number,
  extra: Pick<VariantSeed, 'sale'> = {},
): VariantSeed {
  const weight = grams === 1000 ? '1 kg' : `${grams} g`;
  return {
    sku: `${prefix}-${grams}-${grind}`,
    name: `${weight} - ${GRIND[grind]}`,
    attributes: { weight: `${grams}g`, grind: GRIND[grind] },
    price,
    stock,
    weightGram: grams,
    ...extra,
  };
}

/** Biến thể dụng cụ/phụ kiện: thuộc tính tự do. */
function item(
  sku: string,
  name: string,
  attributes: Record<string, string>,
  price: number,
  stock: number,
  weightGram: number,
  extra: Pick<VariantSeed, 'sale' | 'lowStockThreshold'> = {},
): VariantSeed {
  return { sku, name, attributes, price, stock, weightGram, ...extra };
}

export const SEED_PRODUCTS: ProductSeed[] = [
  // ───────────── Specialty (5) ─────────────
  {
    slug: 'ethiopia-yirgacheffe-washed',
    name: 'Ethiopia Yirgacheffe Washed',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Hương hoa và cam chanh, hậu vị sạch.',
    description:
      'Cà phê Ethiopia sơ chế ướt, rang sáng để giữ nét hoa và trái cây có múi. Tách cà phê nhẹ, thanh và sạch, hợp với người thích vị chua dịu.\n\n- Gợi ý pha: pour-over hoặc AeroPress.\n- Nên dùng trong vòng vài tuần sau ngày rang để giữ hương thơm.',
    tags: ['specialty', 'hoa', 'cam chanh', 'ethiopia'],
    status: 'ACTIVE',
    isFeatured: true,
    coffee: {
      originCountry: 'Ethiopia',
      originRegion: 'Yirgacheffe',
      variety: 'Heirloom',
      process: 'WASHED',
      roastLevel: 'LIGHT',
      altitude: null,
      tastingNotes: ['Hoa nhài', 'Cam chanh', 'Trà đen'],
      brewMethods: ['POUR_OVER', 'AEROPRESS'],
      roastDaysAgo: 6,
    },
    variants: [
      bean('ETH', 250, 'WB', 210000, 40, { sale: { price: 185000, window: 'ACTIVE' } }),
      bean('ETH', 250, 'PO', 215000, 25),
      bean('ETH', 500, 'WB', 395000, 18),
      bean('ETH', 500, 'PO', 405000, 0),
    ],
    stats: [128, 4.6, 18],
  },
  {
    slug: 'colombia-huila-natural',
    name: 'Colombia Huila Natural',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Ngọt trái cây chín, hơi hướng rượu vang.',
    description:
      'Cà phê Colombia sơ chế khô, vị ngọt trái cây rõ và thân vị tròn. Phù hợp khi bạn muốn thử một tách cà phê có cá tính nhưng vẫn dễ uống.\n\n- Gợi ý pha: pour-over hoặc cold brew.',
    tags: ['specialty', 'trái cây', 'natural', 'colombia'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Colombia',
      originRegion: 'Huila',
      variety: 'Arabica',
      process: 'NATURAL',
      roastLevel: 'LIGHT',
      altitude: null,
      tastingNotes: ['Dâu chín', 'Rượu vang', 'Caramel'],
      brewMethods: ['POUR_OVER', 'COLD_BREW'],
      roastDaysAgo: 9,
    },
    variants: [
      bean('COL', 250, 'WB', 225000, 30),
      bean('COL', 250, 'PO', 230000, 22),
      bean('COL', 500, 'WB', 425000, 15),
    ],
    stats: [74, 4.4, 12],
  },
  {
    slug: 'kenya-aa',
    name: 'Kenya AA',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Chua sáng như nho đen, hậu vị ngọt đường nâu.',
    description:
      'Cà phê Kenya với độ chua sáng và vị trái cây đậm nét, đặc trưng của dòng cà phê vùng cao Đông Phi. Rang vừa để cân bằng giữa chua và ngọt.\n\n- Gợi ý pha: pour-over hoặc espresso.',
    tags: ['specialty', 'kenya', 'chua sáng', 'trái cây'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Kenya',
      originRegion: 'Nyeri',
      variety: 'Arabica',
      process: 'WASHED',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Nho đen', 'Cà chua chín', 'Đường nâu'],
      brewMethods: ['POUR_OVER', 'ESPRESSO'],
      roastDaysAgo: 12,
    },
    variants: [bean('KEN', 250, 'WB', 240000, 3), bean('KEN', 250, 'PO', 245000, 4), bean('KEN', 500, 'WB', 455000, 12)],
    stats: [41, 4.7, 9],
  },
  {
    slug: 'viet-nam-cau-dat-honey',
    name: 'Việt Nam Cầu Đất Honey',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Arabica Cầu Đất sơ chế mật ong, ngọt dịu và thơm.',
    description:
      'Arabica trồng ở vùng Cầu Đất (Lâm Đồng), sơ chế kiểu mật ong (honey) nên vị ngọt tự nhiên và hương trái cây chín. Một lựa chọn tốt để làm quen với specialty Việt Nam.\n\n- Gợi ý pha: pour-over hoặc AeroPress.',
    tags: ['specialty', 'việt nam', 'cầu đất', 'honey'],
    status: 'ACTIVE',
    isFeatured: true,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Cầu Đất, Lâm Đồng',
      variety: 'Arabica',
      process: 'HONEY',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Mật ong', 'Trái cây chín', 'Hạnh nhân'],
      brewMethods: ['POUR_OVER', 'AEROPRESS'],
      roastDaysAgo: 4,
    },
    variants: [bean('CDH', 250, 'WB', 175000, 45), bean('CDH', 250, 'PO', 180000, 35), bean('CDH', 500, 'WB', 335000, 20)],
    stats: [96, 4.8, 22],
  },
  {
    slug: 'brazil-cerrado',
    name: 'Brazil Cerrado',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Vị socola và hạt dẻ, thân vị đầy, dễ uống.',
    description:
      'Cà phê Brazil sơ chế khô, rang đậm vừa. Vị ngọt hậu, ít chua, thân vị dày nên rất hợp để pha espresso hoặc moka pot.\n\n- Gợi ý pha: espresso, moka pot hoặc French Press.',
    tags: ['specialty', 'brazil', 'socola', 'ít chua'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Brazil',
      originRegion: 'Cerrado Mineiro',
      variety: 'Arabica',
      process: 'NATURAL',
      roastLevel: 'MEDIUM_DARK',
      altitude: null,
      tastingNotes: ['Socola', 'Hạt dẻ', 'Caramel'],
      brewMethods: ['ESPRESSO', 'MOKA', 'FRENCH_PRESS'],
      roastDaysAgo: 15,
    },
    variants: [bean('BRA', 250, 'WB', 155000, 60), bean('BRA', 250, 'PO', 160000, 38), bean('BRA', 500, 'WB', 295000, 27)],
    stats: [152, 4.3, 31],
  },

  // ───────────── Cà phê Việt (5) ─────────────
  {
    slug: 'robusta-buon-ma-thuot',
    name: 'Robusta Buôn Ma Thuột',
    categorySlug: 'ca-phe-viet',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Robusta đậm đà, đắng ngọt, chuẩn vị phin truyền thống.',
    description:
      'Robusta trồng ở vùng Buôn Ma Thuột (Đắk Lắk), rang đậm cho ly cà phê phin đậm đà, hậu vị đắng ngọt. Hợp với cà phê sữa đá hoặc uống đen.\n\n- Gợi ý pha: phin hoặc espresso.',
    tags: ['robusta', 'việt nam', 'phin', 'đậm đà'],
    status: 'ACTIVE',
    isFeatured: true,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Buôn Ma Thuột, Đắk Lắk',
      variety: 'Robusta',
      process: 'NATURAL',
      roastLevel: 'DARK',
      altitude: null,
      tastingNotes: ['Socola đen', 'Hạt rang', 'Đậm đà'],
      brewMethods: ['PHIN', 'ESPRESSO'],
      roastDaysAgo: 7,
    },
    variants: [
      bean('ROB', 250, 'WB', 85000, 70),
      bean('ROB', 250, 'PHIN', 85000, 66),
      bean('ROB', 500, 'PHIN', 175000, 40, { sale: { price: 165000, window: 'ACTIVE' } }),
      bean('ROB', 1000, 'PHIN', 335000, 2),
    ],
    stats: [310, 4.5, 64],
  },
  {
    slug: 'arabica-cau-dat-medium',
    name: 'Arabica Cầu Đất Medium',
    categorySlug: 'ca-phe-viet',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Arabica Cầu Đất rang vừa, chua thanh và hậu ngọt.',
    description:
      'Arabica Cầu Đất rang mức vừa, giữ được độ chua thanh và hương hoa nhẹ. Uống đen vẫn êm, pha phin thêm chút sữa cũng rất hợp.\n\n- Gợi ý pha: phin hoặc pour-over.',
    tags: ['arabica', 'việt nam', 'cầu đất', 'chua thanh'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Cầu Đất, Lâm Đồng',
      variety: 'Arabica',
      process: 'WASHED',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Hương hoa', 'Chua thanh', 'Hậu vị ngọt'],
      brewMethods: ['PHIN', 'POUR_OVER'],
      roastDaysAgo: 10,
    },
    variants: [bean('ACD', 250, 'WB', 135000, 33), bean('ACD', 250, 'PHIN', 135000, 28), bean('ACD', 500, 'PHIN', 255000, 19)],
    stats: [187, 4.4, 40],
  },
  {
    slug: 'arabica-son-la',
    name: 'Arabica Sơn La',
    categorySlug: 'ca-phe-viet',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Arabica Tây Bắc, vị hạt dẻ và caramel, chua dịu.',
    description:
      'Arabica trồng ở Sơn La, rang vừa cho vị hạt dẻ, caramel và độ chua dịu. Một tách cà phê cân bằng, dễ pha và dễ uống mỗi ngày.\n\n- Gợi ý pha: phin, pour-over hoặc French Press.',
    tags: ['arabica', 'việt nam', 'sơn la', 'cân bằng'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Sơn La',
      variety: 'Arabica',
      process: 'WASHED',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Hạt dẻ', 'Caramel', 'Chua dịu'],
      brewMethods: ['PHIN', 'POUR_OVER', 'FRENCH_PRESS'],
      roastDaysAgo: 18,
    },
    variants: [bean('ASL', 250, 'WB', 125000, 24), bean('ASL', 250, 'PHIN', 125000, 31), bean('ASL', 500, 'PHIN', 235000, 14)],
    stats: [93, 4.2, 17],
  },
  {
    slug: 'culi-rang-dam',
    name: 'Culi Rang Đậm',
    categorySlug: 'ca-phe-viet',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Culi rang đậm, đắng mạnh, hậu vị kéo dài.',
    description:
      'Hạt culi (hạt tròn) rang đậm cho vị đắng rõ, thân vị mạnh và hậu vị lâu. Dành cho người thích ly cà phê phin thật đậm.\n\n- Gợi ý pha: phin hoặc espresso.',
    tags: ['culi', 'robusta', 'việt nam', 'rang đậm'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Đắk Lắk',
      variety: 'Culi',
      process: 'NATURAL',
      roastLevel: 'DARK',
      altitude: null,
      tastingNotes: ['Đắng đậm', 'Socola đen', 'Hậu vị lâu'],
      brewMethods: ['PHIN', 'ESPRESSO'],
      roastDaysAgo: 21,
    },
    variants: [bean('CUL', 250, 'PHIN', 95000, 52), bean('CUL', 500, 'PHIN', 185000, 41), bean('CUL', 1000, 'PHIN', 355000, 16)],
    stats: [205, 4.1, 28],
  },
  {
    slug: 'moka-cau-dat',
    name: 'Moka Cầu Đất',
    categorySlug: 'ca-phe-viet',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Giống Moka Cầu Đất, hương thơm nồng và hậu ngọt.',
    description:
      'Cà phê giống Moka trồng ở Cầu Đất, nổi tiếng với hương thơm nồng và hậu vị ngọt. Rang vừa đậm để giữ nét thơm nhưng vẫn có độ đầy.\n\n- Gợi ý pha: phin hoặc pour-over.',
    tags: ['moka', 'việt nam', 'cầu đất', 'thơm'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Cầu Đất, Lâm Đồng',
      variety: 'Moka',
      process: 'WASHED',
      roastLevel: 'MEDIUM_DARK',
      altitude: null,
      tastingNotes: ['Hương thơm nồng', 'Chua nhẹ', 'Hậu vị ngọt'],
      brewMethods: ['PHIN', 'POUR_OVER'],
      roastDaysAgo: 25,
    },
    variants: [bean('MOK', 250, 'WB', 145000, 21), bean('MOK', 250, 'PHIN', 145000, 17), bean('MOK', 500, 'WB', 275000, 11)],
    stats: [58, 4.5, 11],
  },

  // ───────────── Blend (3) ─────────────
  {
    slug: 'blend-phin-truyen-thong',
    name: 'Blend Phin Truyền Thống',
    categorySlug: 'blend',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Phối Arabica và Robusta cho ly phin đậm, béo nhẹ.',
    description:
      'Blend phối Arabica và Robusta theo công thức dành riêng cho phin: đậm, đắng vừa, hậu béo nhẹ. Uống đen hay pha sữa đều ổn định.\n\n- Gợi ý pha: phin.',
    tags: ['blend', 'phin', 'truyền thống', 'đậm'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Lâm Đồng, Đắk Lắk',
      variety: 'Arabica & Robusta',
      process: 'OTHER',
      roastLevel: 'DARK',
      altitude: null,
      tastingNotes: ['Đậm đà', 'Socola', 'Béo nhẹ'],
      brewMethods: ['PHIN'],
      roastDaysAgo: 3,
    },
    variants: [
      bean('BPH', 250, 'PHIN', 79000, 80),
      // Sale đã hết hạn: giá hiệu lực phải về giá niêm yết
      bean('BPH', 500, 'PHIN', 149000, 55, { sale: { price: 129000, window: 'EXPIRED' } }),
      bean('BPH', 1000, 'PHIN', 285000, 34),
    ],
    stats: [420, 4.3, 77],
  },
  {
    slug: 'blend-espresso-can-bang',
    name: 'Blend Espresso Cân Bằng',
    categorySlug: 'blend',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Blend espresso cân bằng giữa đắng, ngọt và béo.',
    description:
      'Blend dành cho máy espresso và moka pot, hướng tới vị cân bằng: có socola sữa, ít chua và lớp crema dễ chịu. Cũng pha được với sữa.\n\n- Gợi ý pha: espresso hoặc moka pot.',
    tags: ['blend', 'espresso', 'cân bằng', 'socola'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Lâm Đồng, Đắk Lắk',
      variety: 'Arabica & Robusta',
      process: 'OTHER',
      roastLevel: 'MEDIUM_DARK',
      altitude: null,
      tastingNotes: ['Socola sữa', 'Hạt rang', 'Cân bằng'],
      brewMethods: ['ESPRESSO', 'MOKA'],
      roastDaysAgo: 8,
    },
    variants: [bean('BES', 250, 'WB', 115000, 44), bean('BES', 250, 'ESP', 118000, 36), bean('BES', 500, 'WB', 215000, 26)],
    stats: [133, 4.4, 25],
  },
  {
    slug: 'blend-cold-brew',
    name: 'Blend Cold Brew',
    categorySlug: 'blend',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Blend ủ lạnh, ngọt dịu, ít đắng, dễ uống.',
    description:
      'Blend dành riêng cho cà phê ủ lạnh, xay thô để ngâm nhiều giờ. Thành phẩm êm, ngọt dịu và ít đắng, uống cùng đá hoặc sữa tươi đều ngon.\n\n- Gợi ý pha: cold brew hoặc French Press.',
    tags: ['blend', 'cold brew', 'ủ lạnh', 'ngọt dịu'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Lâm Đồng',
      variety: 'Arabica & Robusta',
      process: 'OTHER',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Trái cây khô', 'Ca cao', 'Ngọt dịu'],
      brewMethods: ['COLD_BREW', 'FRENCH_PRESS'],
      roastDaysAgo: 11,
    },
    variants: [bean('BCB', 250, 'CB', 125000, 29), bean('BCB', 500, 'CB', 235000, 20)],
    stats: [67, 4.0, 13],
  },

  // ───────────── Decaf (2) ─────────────
  {
    slug: 'decaf-colombia',
    name: 'Decaf Colombia',
    categorySlug: 'decaf',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Cà phê đã tách caffeine, vị caramel và hạt dẻ.',
    description:
      'Cà phê Colombia đã tách phần lớn caffeine, giữ vị caramel và hạt dẻ dịu êm. Phù hợp khi bạn muốn uống cà phê vào buổi tối.\n\n- Gợi ý pha: pour-over hoặc espresso.',
    tags: ['decaf', 'colombia', 'ít caffeine', 'dịu êm'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Colombia',
      originRegion: 'Huila',
      variety: 'Arabica',
      process: 'WASHED',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Caramel', 'Hạt dẻ', 'Dịu êm'],
      brewMethods: ['POUR_OVER', 'ESPRESSO'],
      roastDaysAgo: 14,
    },
    variants: [bean('DCO', 250, 'WB', 195000, 18), bean('DCO', 250, 'PO', 200000, 12)],
    stats: [22, 4.2, 6],
  },
  {
    slug: 'decaf-brazil',
    name: 'Decaf Brazil',
    categorySlug: 'decaf',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Brazil decaf, vị socola dịu, ít chua.',
    description:
      'Cà phê Brazil đã tách phần lớn caffeine, vị socola và ca cao dịu, gần như không chua. Hiện đang tạm hết hàng, bạn có thể quay lại sau.\n\n- Gợi ý pha: espresso hoặc French Press.',
    tags: ['decaf', 'brazil', 'ít caffeine', 'socola'],
    status: 'ACTIVE',
    isFeatured: false,
    coffee: {
      originCountry: 'Brazil',
      originRegion: 'Cerrado Mineiro',
      variety: 'Arabica',
      process: 'NATURAL',
      roastLevel: 'MEDIUM_DARK',
      altitude: null,
      tastingNotes: ['Socola', 'Ca cao', 'Dịu êm'],
      brewMethods: ['ESPRESSO', 'FRENCH_PRESS'],
      roastDaysAgo: 20,
    },
    // Tồn kho 0: cả sản phẩm hết hàng (inStock = false)
    variants: [bean('DBR', 250, 'WB', 175000, 0)],
    stats: [15, 3.9, 4],
  },

  // ───────────── Phin (2) ─────────────
  {
    slug: 'phin-nhom-1-ngan',
    name: 'Phin nhôm 1 ngăn',
    categorySlug: 'phin',
    brandSlug: null,
    shortDesc: 'Phin nhôm quen thuộc, nhẹ, bền, giá dễ chịu.',
    description:
      'Phin nhôm 1 ngăn kiểu truyền thống, nhẹ và dễ dùng. Lựa chọn cơ bản cho ly cà phê phin hằng ngày.\n\n- Chọn cỡ theo lượng cà phê bạn thường pha.\n- Rửa sạch và để ráo sau khi dùng.',
    tags: ['phin', 'nhôm', 'truyền thống', 'cơ bản'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      // Cân nặng dụng cụ: ước lượng làm tròn, dùng để tính phí ship
      item('PHIN-NHOM-S', 'Cỡ nhỏ', { size: 'Nhỏ' }, 25000, 60, 80),
      item('PHIN-NHOM-M', 'Cỡ vừa', { size: 'Vừa' }, 29000, 48, 100),
      item('PHIN-NHOM-L', 'Cỡ lớn', { size: 'Lớn' }, 35000, 35, 130),
    ],
    stats: [260, 4.0, 52],
  },
  {
    slug: 'phin-inox',
    name: 'Phin inox',
    categorySlug: 'phin',
    brandSlug: null,
    shortDesc: 'Phin inox chắc tay, dễ vệ sinh, dùng lâu.',
    description:
      'Phin inox có độ bền cao, bề mặt dễ làm sạch và ít bị móp méo so với phin nhôm. Hợp với người pha cà phê thường xuyên.\n\n- Chọn cỡ theo lượng cà phê bạn thường pha.',
    tags: ['phin', 'inox', 'bền', 'dễ vệ sinh'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('PHIN-INOX-S', 'Cỡ nhỏ', { size: 'Nhỏ' }, 49000, 40, 120),
      item('PHIN-INOX-M', 'Cỡ vừa', { size: 'Vừa' }, 59000, 38, 150),
      item('PHIN-INOX-L', 'Cỡ lớn', { size: 'Lớn' }, 69000, 22, 180),
    ],
    stats: [175, 4.3, 36],
  },

  // ───────────── Pour-over (4) ─────────────
  {
    slug: 'hario-v60-02',
    name: 'Hario V60 02',
    categorySlug: 'pour-over',
    brandSlug: 'hario',
    shortDesc: 'Phễu V60 cỡ 02 quen thuộc của người pha pour-over.',
    description:
      'Phễu pha cà phê V60 của Hario với thiết kế hình nón và rãnh xoắn bên trong, giúp bạn chủ động kiểm soát tốc độ chiết xuất. Dùng cùng giấy lọc V60 cỡ 02.\n\n- Có bản nhựa và bản sứ.\n- Làm nóng phễu và làm ướt giấy lọc trước khi pha.',
    tags: ['hario', 'v60', 'pour-over', 'phễu'],
    status: 'ACTIVE',
    isFeatured: true,
    variants: [
      item('HARIO-V60-02-NHUA', 'Nhựa - Trong suốt', { material: 'Nhựa', color: 'Trong suốt' }, 210000, 36, 120),
      item('HARIO-V60-02-DO', 'Nhựa - Đỏ', { material: 'Nhựa', color: 'Đỏ' }, 220000, 20, 120),
      item('HARIO-V60-02-SU', 'Sứ - Trắng', { material: 'Sứ', color: 'Trắng' }, 395000, 14, 400),
    ],
    stats: [214, 4.8, 47],
  },
  {
    slug: 'kalita-wave-185',
    name: 'Kalita Wave 185',
    categorySlug: 'pour-over',
    brandSlug: 'kalita',
    shortDesc: 'Phễu đáy phẳng ba lỗ, chiết xuất đều và dễ lặp lại.',
    description:
      'Kalita Wave có đáy phẳng, dùng giấy lọc dạng xếp nếp nên dòng nước phân bổ đều và khá dễ cho người mới. Dùng cùng giấy lọc Wave cỡ 185.\n\n- Có bản inox và bản sứ.',
    tags: ['kalita', 'wave', 'pour-over', 'phễu'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('KALITA-W185-INOX', 'Inox', { material: 'Inox' }, 520000, 23, 300),
      item('KALITA-W185-SU', 'Sứ', { material: 'Sứ' }, 650000, 12, 500),
    ],
    stats: [88, 4.6, 19],
  },
  {
    slug: 'chemex-3-cup',
    name: 'Chemex 3 cup',
    categorySlug: 'pour-over',
    brandSlug: 'chemex',
    shortDesc: 'Bình pha thủy tinh kiểu dáng đồng hồ cát, cổ gỗ.',
    description:
      'Chemex là bình pha pour-over bằng thủy tinh liền khối với kiểu dáng đồng hồ cát nổi tiếng. Dùng giấy lọc riêng của Chemex, cho tách cà phê sạch và trong.\n\n- Có 2 dung tích: 3 cup và 6 cup.\n- Sản phẩm thủy tinh, cần cẩn thận khi vệ sinh.',
    tags: ['chemex', 'pour-over', 'thủy tinh', 'quà tặng'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      // 3 cup còn đúng 5 (= lowStockThreshold): biên LOW_STOCK
      item('CHEMEX-3C', '3 cup', { size: '3 cup' }, 1150000, 5, 600),
      item('CHEMEX-6C', '6 cup', { size: '6 cup' }, 1490000, 11, 900),
    ],
    stats: [34, 4.7, 8],
  },
  {
    slug: 'bo-pheu-ly-chia',
    name: 'Bộ phễu + ly chia',
    categorySlug: 'pour-over',
    brandSlug: null,
    shortDesc: 'Bộ phễu pour-over kèm ly chia, đủ để bắt đầu.',
    description:
      'Bộ phễu pha và ly chia (server) dành cho người mới bắt đầu với pour-over. Có vạch dung tích trên ly để dễ theo dõi lượng cà phê.\n\n- Có 2 dung tích ly chia.',
    tags: ['pour-over', 'bộ pha', 'ly chia', 'người mới'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('BO-PHEU-LY-360', 'Ly chia 360 ml', { capacity: '360 ml' }, 290000, 30, 500),
      item('BO-PHEU-LY-600', 'Ly chia 600 ml', { capacity: '600 ml' }, 340000, 25, 650),
    ],
    stats: [61, 4.1, 14],
  },

  // ───────────── French Press / AeroPress / Moka Pot (3) ─────────────
  {
    slug: 'binh-french-press-600ml',
    name: 'Bình French Press 600 ml',
    categorySlug: 'french-press-aeropress-moka-pot',
    brandSlug: null,
    shortDesc: 'Bình ép French Press đơn giản, cho tách cà phê đậm vị.',
    description:
      'French Press là cách pha ngâm ép dễ làm nhất: cho cà phê xay thô và nước nóng vào, chờ rồi ép. Cho ly cà phê thân vị đầy và nhiều dầu cà phê.\n\n- Có 2 dung tích.\n- Thân bằng thủy tinh, cần cẩn thận khi vệ sinh.',
    tags: ['french press', 'bình ép', 'ngâm ép', 'dễ dùng'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('FP-600-DEN', '600 ml - Đen', { capacity: '600 ml', color: 'Đen' }, 320000, 28, 700),
      item('FP-350-DEN', '350 ml - Đen', { capacity: '350 ml', color: 'Đen' }, 250000, 34, 500),
    ],
    stats: [102, 4.2, 21],
  },
  {
    slug: 'aeropress-original',
    name: 'AeroPress Original',
    categorySlug: 'french-press-aeropress-moka-pot',
    brandSlug: 'aeropress',
    shortDesc: 'Dụng cụ pha nhỏ gọn, bền, dễ mang đi du lịch.',
    description:
      'AeroPress là dụng cụ pha cà phê bằng áp lực tay, nhỏ gọn, khó vỡ và rất linh hoạt: có thể thử nhiều công thức khác nhau. Phù hợp để mang theo khi đi xa.\n\n- Khuyến mãi sắp diễn ra (dữ liệu mẫu để thử giá khuyến mãi chưa bắt đầu).',
    tags: ['aeropress', 'du lịch', 'nhỏ gọn', 'pha thủ công'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      // Sale chưa bắt đầu: giá hiệu lực hiện tại vẫn là giá niêm yết
      item('AEROPRESS-ORIG', 'Bản gốc', { model: 'Original' }, 950000, 21, 500, {
        sale: { price: 850000, window: 'UPCOMING' },
      }),
    ],
    stats: [79, 4.7, 16],
  },
  {
    slug: 'bialetti-moka-express-3-cup',
    name: 'Bialetti Moka Express 3 cup',
    categorySlug: 'french-press-aeropress-moka-pot',
    brandSlug: 'bialetti',
    shortDesc: 'Ấm moka pot kiểu Ý, pha cà phê đậm trên bếp.',
    description:
      'Bialetti Moka Express là ấm moka pot kinh điển của Ý, pha cà phê đậm trên bếp, gần với vị espresso. Thiết kế tám cạnh dễ nhận ra.\n\n- Có 2 dung tích: 3 cup và 6 cup.\n- Kiểm tra loại bếp trước khi mua.',
    tags: ['bialetti', 'moka pot', 'espresso', 'kiểu Ý'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('BIALETTI-MOKA-3C', '3 cup', { size: '3 cup' }, 650000, 19, 400),
      item('BIALETTI-MOKA-6C', '6 cup', { size: '6 cup' }, 790000, 13, 600),
    ],
    stats: [57, 4.5, 15],
  },

  // ───────────── Máy xay (3) ─────────────
  {
    slug: 'timemore-c2',
    name: 'Timemore C2',
    categorySlug: 'may-xay',
    brandSlug: 'timemore',
    shortDesc: 'Máy xay tay phổ biến, vỏ kim loại, dễ chỉnh độ mịn.',
    description:
      'Timemore C2 là máy xay cà phê bằng tay được nhiều người dùng chọn khi bắt đầu pha thủ công: vỏ kim loại, tay quay êm, chỉnh độ mịn bằng núm xoay.\n\n- Xay tại nhà giúp giữ hương thơm của cà phê.',
    tags: ['timemore', 'máy xay tay', 'xay cà phê', 'pha thủ công'],
    status: 'ACTIVE',
    isFeatured: true,
    variants: [
      item('TMR-C2-DEN', 'Đen', { color: 'Đen' }, 1150000, 26, 700),
      item('TMR-C2-XAM', 'Xám', { color: 'Xám' }, 1150000, 19, 700),
      item('TMR-C2-XANH', 'Xanh', { color: 'Xanh' }, 1150000, 0, 700),
    ],
    stats: [141, 4.9, 38],
  },
  {
    slug: 'may-xay-tay-inox',
    name: 'Máy xay tay inox phổ thông',
    categorySlug: 'may-xay',
    brandSlug: null,
    shortDesc: 'Máy xay tay inox giá mềm, phù hợp nhu cầu cơ bản.',
    description:
      'Máy xay tay vỏ inox, kiểu dáng gọn, giá dễ tiếp cận. Hợp với người mới muốn thử xay hạt tại nhà trước khi đầu tư dòng cao hơn.\n\n- Có thể tháo rời để vệ sinh.',
    tags: ['máy xay tay', 'inox', 'giá mềm', 'cơ bản'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('MXT-INOX-BAC', 'Bạc', { color: 'Bạc' }, 450000, 31, 600),
      item('MXT-INOX-DEN', 'Đen', { color: 'Đen' }, 460000, 24, 600),
    ],
    stats: [72, 3.9, 18],
  },
  {
    slug: 'may-xay-dien-gia-dinh',
    name: 'Máy xay điện dùng gia đình',
    categorySlug: 'may-xay',
    brandSlug: null,
    shortDesc: 'Máy xay điện cỡ nhỏ cho nhu cầu xay cà phê tại nhà.',
    description:
      'Máy xay điện cỡ gọn dành cho gia đình, tiện khi cần xay nhanh một lượng vừa phải. Phù hợp với cách pha phin và French Press.\n\n- Đọc kỹ hướng dẫn sử dụng và vệ sinh sau khi xay.',
    tags: ['máy xay điện', 'gia đình', 'tiện lợi'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('MXD-GD-DEN', 'Đen', { color: 'Đen' }, 890000, 17, 1500),
      item('MXD-GD-TRANG', 'Trắng', { color: 'Trắng' }, 890000, 13, 1500),
    ],
    stats: [29, 4.0, 7],
  },

  // ───────────── Ấm rót, cân, nhiệt kế (3) ─────────────
  {
    slug: 'am-rot-co-ngong-600ml',
    name: 'Ấm rót cổ ngỗng 600 ml',
    categorySlug: 'am-rot-can-nhiet-ke',
    brandSlug: null,
    shortDesc: 'Ấm rót cổ ngỗng giúp kiểm soát dòng nước khi pha pour-over.',
    description:
      'Ấm rót có vòi cổ ngỗng thon dài, giúp rót nước thành dòng nhỏ và đều. Dụng cụ gần như bắt buộc nếu bạn pha pour-over thường xuyên.\n\n- Dùng được trên bếp tùy loại, kiểm tra thông tin trước khi mua.',
    tags: ['ấm rót', 'cổ ngỗng', 'pour-over', 'kiểm soát dòng nước'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('AMROT-600-DEN', 'Đen mờ', { color: 'Đen mờ' }, 690000, 22, 800),
      item('AMROT-600-BAC', 'Bạc', { color: 'Bạc' }, 650000, 18, 800),
      item('AMROT-600-DONG', 'Vàng đồng', { color: 'Vàng đồng' }, 720000, 11, 800),
    ],
    stats: [64, 4.4, 15],
  },
  {
    slug: 'can-dien-tu-pha-ca-phe',
    name: 'Cân điện tử pha cà phê',
    categorySlug: 'am-rot-can-nhiet-ke',
    brandSlug: null,
    shortDesc: 'Cân điện tử có bấm giờ, hỗ trợ pha cà phê chính xác.',
    description:
      'Cân điện tử dùng để cân cà phê và nước khi pha, giúp mỗi lần pha ra vị ổn định. Bề mặt gọn, đặt vừa dưới ly chia hoặc ly pha.\n\n- Nên đặt cân trên mặt phẳng và tránh để nước tràn vào máy.',
    tags: ['cân điện tử', 'pha chế', 'chính xác', 'pour-over'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('CAN-DT-DEN', 'Đen', { color: 'Đen' }, 420000, 33, 500),
      item('CAN-DT-TRANG', 'Trắng', { color: 'Trắng' }, 420000, 27, 500),
    ],
    stats: [83, 4.3, 20],
  },
  {
    slug: 'nhiet-ke-pha-che',
    name: 'Nhiệt kế dùng cho pha chế',
    categorySlug: 'am-rot-can-nhiet-ke',
    brandSlug: null,
    shortDesc: 'Nhiệt kế cắm giúp theo dõi nhiệt độ nước khi pha.',
    description:
      'Nhiệt kế dạng cắm, dùng để kiểm tra nhiệt độ nước hoặc sữa trước khi pha. Gọn nhẹ, dễ lau chùi.\n\n- Rửa sạch và lau khô sau khi dùng.',
    tags: ['nhiệt kế', 'pha chế', 'nhiệt độ nước'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('NHIETKE-BAC', 'Bạc', { color: 'Bạc' }, 150000, 45, 60),
      item('NHIETKE-DEN', 'Đen', { color: 'Đen' }, 160000, 29, 60),
    ],
    stats: [47, 3.8, 10],
  },

  // ───────────── Giấy lọc (2) ─────────────
  {
    slug: 'giay-loc-v60-02',
    name: 'Giấy lọc V60 02 (100 tờ)',
    categorySlug: 'giay-loc',
    brandSlug: 'hario',
    shortDesc: 'Giấy lọc hình nón dùng cho phễu V60 cỡ 02.',
    description:
      'Giấy lọc hình nón dành cho phễu V60 cỡ 02. Có bản trắng và bản nâu (không tẩy), nên làm ướt giấy bằng nước nóng trước khi pha để bớt mùi giấy.\n\n- Chọn số lượng tờ theo nhu cầu.',
    tags: ['giấy lọc', 'v60', 'pour-over', 'hario'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('GL-V60-100-TRANG', '100 tờ - Trắng', { quantity: '100 tờ', color: 'Trắng' }, 55000, 80, 100),
      item('GL-V60-100-NAU', '100 tờ - Nâu', { quantity: '100 tờ', color: 'Nâu' }, 55000, 70, 100),
      item('GL-V60-40-TRANG', '40 tờ - Trắng', { quantity: '40 tờ', color: 'Trắng' }, 28000, 58, 50),
    ],
    stats: [390, 4.6, 83],
  },
  {
    slug: 'giay-loc-chemex',
    name: 'Giấy lọc Chemex',
    categorySlug: 'giay-loc',
    brandSlug: 'chemex',
    shortDesc: 'Giấy lọc dành cho bình Chemex, cho tách cà phê sạch.',
    description:
      'Giấy lọc dành riêng cho bình Chemex. Lớp giấy dày giúp tách cà phê sạch và trong. Mở giấy đúng cách và đặt vào phễu trước khi rót nước.\n\n- Chọn số lượng tờ theo nhu cầu.',
    tags: ['giấy lọc', 'chemex', 'pour-over'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('GL-CHEMEX-100', '100 tờ', { quantity: '100 tờ' }, 265000, 40, 300),
      item('GL-CHEMEX-25', '25 tờ', { quantity: '25 tờ' }, 79000, 62, 80),
    ],
    stats: [46, 4.5, 9],
  },

  // ───────────── Ly, cốc, bình giữ nhiệt (2) ─────────────
  {
    slug: 'ly-su-espresso',
    name: 'Ly sứ espresso',
    categorySlug: 'ly-coc-binh-giu-nhiet',
    brandSlug: null,
    shortDesc: 'Ly sứ nhỏ dày dặn, giữ ấm tốt cho shot espresso.',
    description:
      'Ly sứ cỡ nhỏ thành dày, dùng cho espresso hoặc những tách cà phê đậm. Men sứ trơn, dễ vệ sinh.\n\n- Có nhiều màu để chọn.',
    tags: ['ly sứ', 'espresso', 'cốc', 'quán cà phê'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('LY-ESP-TRANG', 'Trắng', { color: 'Trắng' }, 85000, 50, 150),
      item('LY-ESP-DEN', 'Đen', { color: 'Đen' }, 90000, 41, 150),
      item('LY-ESP-KEM', 'Kem', { color: 'Kem' }, 90000, 36, 150),
    ],
    stats: [118, 4.2, 26],
  },
  {
    slug: 'binh-giu-nhiet-500ml',
    name: 'Bình giữ nhiệt 500 ml',
    categorySlug: 'ly-coc-binh-giu-nhiet',
    brandSlug: null,
    shortDesc: 'Bình giữ nhiệt tiện mang theo cà phê đi làm, đi học.',
    description:
      'Bình giữ nhiệt dung tích 500 ml, tiện mang theo cà phê đi làm hay đi du lịch. Nắp vặn chắc, thân bình gọn tay.\n\n- Rửa sạch sau mỗi lần dùng, tránh để cà phê qua đêm trong bình.',
    tags: ['bình giữ nhiệt', 'mang đi', 'du lịch'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('BGN-500-DEN', '500 ml - Đen', { capacity: '500 ml', color: 'Đen' }, 290000, 29, 400),
      item('BGN-500-XANH', '500 ml - Xanh rêu', { capacity: '500 ml', color: 'Xanh rêu' }, 290000, 23, 400),
      // Ngưỡng cảnh báo riêng 10: tồn 8 -> LOW_STOCK
      item('BGN-500-KEM', '500 ml - Kem', { capacity: '500 ml', color: 'Kem' }, 290000, 8, 400, {
        lowStockThreshold: 10,
      }),
    ],
    stats: [96, 4.4, 24],
  },

  // ───────────── Hộp bảo quản & vệ sinh (2) ─────────────
  {
    slug: 'hop-bao-quan-van-mot-chieu',
    name: 'Hộp bảo quản hạt có van một chiều',
    categorySlug: 'hop-bao-quan-ve-sinh',
    brandSlug: null,
    shortDesc: 'Hộp kín có van một chiều, giúp hạt cà phê lâu bay hương.',
    description:
      'Hộp bảo quản có van một chiều cho phép khí CO2 từ hạt mới rang thoát ra nhưng hạn chế không khí lọt vào. Giúp cà phê giữ hương lâu hơn.\n\n- Đặt nơi khô ráo, tránh ánh nắng.\n- Chọn dung tích theo lượng cà phê thường mua.',
    tags: ['hộp bảo quản', 'van một chiều', 'giữ hương'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('HOP-VAN-250', 'Chứa 250 g', { capacity: '250 g' }, 165000, 37, 300),
      item('HOP-VAN-500', 'Chứa 500 g', { capacity: '500 g' }, 235000, 25, 450),
      item('HOP-VAN-1000', 'Chứa 1 kg', { capacity: '1 kg' }, 315000, 15, 700),
    ],
    stats: [68, 4.3, 17],
  },
  {
    slug: 'bot-ve-sinh-may-xay',
    name: 'Bột vệ sinh máy xay',
    categorySlug: 'hop-bao-quan-ve-sinh',
    brandSlug: null,
    shortDesc: 'Hạt làm sạch giúp loại bỏ dầu cà phê bám trong máy xay.',
    description:
      'Hạt làm sạch chuyên dụng cho máy xay cà phê, giúp lấy bớt dầu và cặn cà phê bám trong lưỡi xay. Nên vệ sinh định kỳ để vị cà phê không bị lẫn mùi cũ.\n\n- Làm theo hướng dẫn trên bao bì.',
    tags: ['vệ sinh', 'máy xay', 'bảo dưỡng'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [
      item('BVS-150', '150 g', { capacity: '150 g' }, 99000, 44, 170),
      item('BVS-300', '300 g', { capacity: '300 g' }, 169000, 30, 320),
    ],
    stats: [38, 4.1, 8],
  },

  // ───────────── Quà tặng & Combo (2) ─────────────
  {
    slug: 'gift-box-pour-over-starter',
    name: 'Gift box Pour-over Starter',
    categorySlug: 'qua-tang-combo',
    brandSlug: null,
    shortDesc: 'Hộp quà cho người mới bắt đầu với pour-over.',
    description:
      'Hộp quà gồm các món cơ bản để bắt đầu với pour-over: phễu, giấy lọc và một gói cà phê hạt. Đóng gói sẵn, thích hợp làm quà cho người mới tập pha.\n\n- Thành phần chi tiết có thể thay đổi theo từng đợt, vui lòng xem ghi chú đơn hàng.',
    tags: ['quà tặng', 'gift box', 'pour-over', 'combo'],
    status: 'ACTIVE',
    isFeatured: true,
    variants: [item('GIFT-POUR-STARTER', 'Hộp quà cố định', { type: 'Cố định' }, 890000, 20, 1800)],
    stats: [43, 4.8, 12],
  },
  {
    slug: 'combo-phin-robusta-250g',
    name: 'Combo Phin + 250 g Robusta',
    categorySlug: 'qua-tang-combo',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Combo phin nhôm cùng gói Robusta 250 g, tiết kiệm hơn mua lẻ.',
    description:
      'Combo gồm một phin nhôm và gói Robusta 250 g xay phin. Mọi thứ cần có để bắt đầu pha một ly cà phê phin đúng kiểu.\n\n- Phù hợp tặng người thân hoặc dùng thử.',
    tags: ['combo', 'phin', 'robusta', 'tiết kiệm'],
    status: 'ACTIVE',
    isFeatured: false,
    variants: [item('COMBO-PHIN-ROB250', 'Combo cố định', { type: 'Cố định' }, 109000, 60, 380)],
    stats: [235, 4.5, 49],
  },

  // ───────────── Ca kiểm thử: DRAFT / ARCHIVED / xóa mềm (không hiện ở storefront) ─────────────
  {
    slug: 'ethiopia-guji-natural',
    name: 'Ethiopia Guji Natural (sắp ra mắt)',
    categorySlug: 'specialty',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Bản nháp, chưa công bố.',
    description: 'Sản phẩm đang ở trạng thái nháp, dùng để kiểm tra việc ẩn khỏi cửa hàng.',
    tags: ['specialty', 'ethiopia', 'nháp'],
    status: 'DRAFT',
    isFeatured: false,
    coffee: {
      originCountry: 'Ethiopia',
      originRegion: 'Guji',
      variety: 'Heirloom',
      process: 'NATURAL',
      roastLevel: 'LIGHT',
      altitude: null,
      tastingNotes: ['Trái cây chín', 'Hoa'],
      brewMethods: ['POUR_OVER'],
      roastDaysAgo: 5,
    },
    variants: [bean('GUJ', 250, 'WB', 235000, 20)],
    stats: [0, 0, 0],
  },
  {
    slug: 'blend-mua-he-2025',
    name: 'Blend Mùa Hè 2025',
    categorySlug: 'blend',
    brandSlug: 'beanbox-roastery',
    shortDesc: 'Phiên bản giới hạn đã ngừng bán.',
    description: 'Sản phẩm đã lưu trữ (ngừng bán), dùng để kiểm tra việc ẩn khỏi cửa hàng.',
    tags: ['blend', 'giới hạn', 'đã ngừng'],
    status: 'ARCHIVED',
    isFeatured: false,
    coffee: {
      originCountry: 'Việt Nam',
      originRegion: 'Lâm Đồng',
      variety: 'Arabica & Robusta',
      process: 'OTHER',
      roastLevel: 'MEDIUM',
      altitude: null,
      tastingNotes: ['Trái cây khô', 'Ngọt dịu'],
      brewMethods: ['COLD_BREW'],
      roastDaysAgo: 28,
    },
    variants: [bean('BHE', 250, 'WB', 99000, 25)],
    stats: [88, 4.0, 14],
  },
  {
    slug: 'phin-nhua-cu',
    name: 'Phin nhựa (đã ngừng kinh doanh)',
    categorySlug: 'phin',
    brandSlug: null,
    shortDesc: 'Sản phẩm đã xóa mềm.',
    description: 'Sản phẩm đã bị xóa mềm, dùng để kiểm tra việc ẩn khỏi cửa hàng.',
    tags: ['phin', 'nhựa', 'đã xóa'],
    status: 'ACTIVE',
    isFeatured: false,
    deleted: true,
    variants: [item('PHIN-NHUA-S', 'Cỡ vừa', { size: 'Vừa' }, 19000, 30, 70)],
    stats: [12, 3.5, 3],
  },
];
