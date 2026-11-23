/*
 * Sản phẩm của seed nhiều (D-084): 120 sản phẩm, TẤT ĐỊNH (PRNG theo tên sản phẩm).
 * Toàn bộ là dữ liệu GIẢ để thử giao diện/logic: mô tả chỉ nêu thông tin chung, không đưa thông số kỹ thuật
 * cụ thể (không dung tích/điện áp/kích thước), độ cao vùng trồng để null. Module thuần dữ liệu (không chạm DB).
 * Danh sách thô nằm ở products-data.ts; file này dựng biến thể, giá, tồn kho và mô tả.
 */
import { slugify } from '../../../src/lib/slug.js';
import type { ProductSeed, VariantSeed } from '../products.js';
import { ROASTER_BRANDS, TOOL_BRANDS } from './catalog.js';
import {
  COFFEES,
  TOOLS,
  type CoffeeDef,
  type Method,
  type Roast,
  type Process,
  type ToolDef,
} from './products-data.js';
import { chance, hashString, int, mulberry32, pick, type Rng } from './prng.js';

const M: Record<string, Method> = {
  phin: 'PHIN',
  esp: 'ESPRESSO',
  po: 'POUR_OVER',
  cb: 'COLD_BREW',
  fp: 'FRENCH_PRESS',
  ae: 'AEROPRESS',
  moka: 'MOKA',
};

const PROCESS_VI: Record<Process, string> = {
  WASHED: 'sơ chế ướt',
  NATURAL: 'sơ chế khô',
  HONEY: 'sơ chế mật ong (honey)',
  ANAEROBIC: 'sơ chế kỵ khí',
  OTHER: 'sơ chế theo kiểu đặc trưng của vùng',
};
const ROAST_VI: Record<Roast, string> = {
  LIGHT: 'rang sáng',
  MEDIUM: 'rang vừa',
  MEDIUM_DARK: 'rang vừa đậm',
  DARK: 'rang đậm',
};
const METHOD_VI: Record<Method, string> = {
  PHIN: 'phin',
  ESPRESSO: 'espresso',
  POUR_OVER: 'pour-over',
  COLD_BREW: 'cold brew',
  FRENCH_PRESS: 'French Press',
  AEROPRESS: 'AeroPress',
  MOKA: 'Moka Pot',
};
const GRIND_BY_METHOD: Record<Method, [string, string]> = {
  PHIN: ['PHIN', 'Xay phin'],
  ESPRESSO: ['ESP', 'Xay espresso'],
  POUR_OVER: ['PO', 'Xay pour-over'],
  COLD_BREW: ['CB', 'Xay cold brew'],
  FRENCH_PRESS: ['PO', 'Xay pour-over'],
  AEROPRESS: ['PO', 'Xay pour-over'],
  MOKA: ['ESP', 'Xay espresso'],
};

const round = (n: number, step: number) => Math.round(n / step) * step;
const SIZES = [
  { n: 'Nhỏ', price: 1, w: 1 },
  { n: 'Vừa', price: 1.15, w: 1.25 },
  { n: 'Lớn', price: 1.35, w: 1.5 },
] as const;
const COLORS = ['Đen', 'Trắng', 'Xanh rêu', 'Nâu'] as const;
const PACKS = [
  { n: 'Gói nhỏ', price: 1, w: 1 },
  { n: 'Gói lớn', price: 1.8, w: 1.8 },
] as const;

/** Tồn kho đa dạng: ~6% hết hàng, ~10% sắp hết (<= ngưỡng), còn lại dồi dào. */
function stockFor(r: Rng, threshold: number, max: number): number {
  const x = r();
  if (x < 0.06) return 0;
  if (x < 0.16) return int(r, 1, threshold);
  return int(r, threshold + 5, max);
}

function maybeSale(r: Rng, price: number): VariantSeed['sale'] {
  const hit = chance(r, 0.16);
  const factor = 0.8 + r() * 0.12;
  const window = r();
  if (!hit) return undefined;
  const sale = round(price * factor, 1000);
  if (sale <= 0 || sale >= price) return undefined;
  return { price: sale, window: window < 0.7 ? 'ACTIVE' : window < 0.85 ? 'EXPIRED' : 'UPCOMING' };
}

const code = (prefix: string, i: number) => `${prefix}${String(i + 1).padStart(3, '0')}`;

interface VariantInput {
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  weightGram: number;
}

function withStockAndSale(r: Rng, v: VariantInput, maxStock: number): VariantSeed {
  const threshold = 5;
  const sale = maybeSale(r, v.price);
  return {
    ...v,
    stock: stockFor(r, threshold, maxStock),
    lowStockThreshold: threshold,
    ...(sale ? { sale } : {}),
  };
}

function coffeeLead(d: CoffeeDef, r: Rng): string {
  const [, , country, region, , process, roast, , , ,] = d;
  const tail = `${PROCESS_VI[process]}, ${ROAST_VI[roast]}`;
  if (country === 'Nhiều vùng') {
    return `Hỗn hợp cà phê nhiều vùng, ${ROAST_VI[roast]}, phối để vị ổn định và dễ uống mỗi ngày.`;
  }
  if (country === 'Việt Nam') {
    return pick(r, [
      `Cà phê ${region} (Việt Nam), ${tail}.`,
      `Cà phê trồng ở ${region}, ${tail}, hợp khẩu vị người Việt.`,
    ]);
  }
  return pick(r, [
    `Cà phê ${country}, vùng ${region}, ${tail}.`,
    `Cà phê từ ${region} (${country}), ${tail}, dành cho người thích khám phá hương vị.`,
  ]);
}

function coffeeProduct(def: CoffeeDef, index: number): ProductSeed {
  const [
    name,
    cat,
    country,
    region,
    variety,
    process,
    roast,
    notesCsv,
    methodsCsv,
    price250,
    kind,
  ] = def;
  const r = mulberry32(hashString(`rich:${name}`));
  const methods = methodsCsv.split(',').map((m) => M[m] as Method);
  const notes = notesCsv.split(',');
  const prefix = code('RC', index);
  const [grindCode, grindName] = GRIND_BY_METHOD[methods[0] as Method];
  const variants: VariantSeed[] = [];
  if (kind === 'drip') {
    for (const [n, qty] of [
      ['Hộp 10 gói', 10],
      ['Hộp 20 gói', 20],
    ] as const) {
      variants.push(
        withStockAndSale(
          r,
          {
            sku: `${prefix}-${qty}G`,
            name: n,
            attributes: { pack: `${qty} gói` },
            price: round((price250 * qty) / 10, 1000),
            weightGram: qty * 12 + 40,
          },
          140,
        ),
      );
    }
  } else {
    const whole = kind !== 'ground';
    const cands: Array<[number, string, string]> = whole
      ? [
          [250, 'WB', 'Nguyên hạt'],
          [250, grindCode, grindName],
          [500, 'WB', 'Nguyên hạt'],
          [500, grindCode, grindName],
          [1000, 'WB', 'Nguyên hạt'],
        ]
      : [
          [250, grindCode, grindName],
          [500, grindCode, grindName],
          [1000, grindCode, grindName],
        ];
    const n = Math.min(cands.length, int(r, 2, whole ? 4 : 3));
    for (const [grams, gc, gn] of cands.slice(0, n)) {
      const factor = grams === 250 ? 1 : grams === 500 ? 1.85 : 3.4;
      variants.push(
        withStockAndSale(
          r,
          {
            sku: `${prefix}-${grams}-${gc}`,
            name: `${grams === 1000 ? '1 kg' : `${grams} g`} - ${gn}`,
            attributes: { weight: `${grams}g`, grind: gn },
            price: round(price250 * factor, 5000),
            weightGram: grams,
          },
          140,
        ),
      );
    }
  }

  const lead = coffeeLead(def, r);
  const description =
    kind === 'drip'
      ? `${lead} Mỗi gói đã xay sẵn trong túi lọc, chỉ cần treo lên ly và rót nước nóng, tiện cho văn phòng hay chuyến đi.\n\n- Hương vị gợi nhớ ${notes.join(', ').toLowerCase()}.\n- Nên dùng trong vài tuần sau khi mở hộp để giữ hương thơm.`
      : `${lead} Hương vị gợi nhớ ${notes.join(', ').toLowerCase()}.\n\n- Gợi ý pha: ${methods.map((m) => METHOD_VI[m]).join(', ')}.\n- Nên dùng trong vòng 30 ngày sau ngày rang để giữ hương thơm.`;
  return {
    slug: slugify(name),
    name,
    categorySlug: cat,
    brandSlug: ROASTER_BRANDS[index % ROASTER_BRANDS.length]?.slug ?? null,
    shortDesc: `${notes.slice(0, 3).join(', ')}.`,
    description,
    tags: ['cà phê', ROAST_VI[roast], country === 'Nhiều vùng' ? 'blend' : country.toLowerCase()],
    status: 'ACTIVE',
    isFeatured: index % 9 === 0,
    coffee: {
      originCountry: country,
      originRegion: region,
      variety,
      process,
      roastLevel: roast,
      altitude: null,
      tastingNotes: notes,
      brewMethods: methods,
      roastDaysAgo: int(r, 2, 28),
    },
    variants,
    stats: [int(r, 5, 60), 0, 0],
  };
}

function toolProduct(def: ToolDef, index: number): ProductSeed {
  const [name, cat, price, weight, kind, desc, tagsCsv] = def;
  const r = mulberry32(hashString(`rich:${name}`));
  const prefix = code('RT', index);
  const variants: VariantSeed[] = [];
  const add = (
    suffix: string,
    vname: string,
    attributes: Record<string, string>,
    p: number,
    w: number,
  ) =>
    variants.push(
      withStockAndSale(
        r,
        { sku: `${prefix}-${suffix}`, name: vname, attributes, price: p, weightGram: w },
        90,
      ),
    );
  const unit = price >= 300000 ? 5000 : 1000;
  if (kind === 'S') {
    for (const [i, s] of SIZES.slice(0, int(r, 2, 3)).entries()) {
      add(`S${i + 1}`, s.n, { size: s.n }, round(price * s.price, unit), Math.round(weight * s.w));
    }
  } else if (kind === 'C') {
    for (const [i, c] of COLORS.slice(0, int(r, 2, 4)).entries()) {
      add(`C${i + 1}`, c, { color: c }, price, weight);
    }
  } else if (kind === 'P') {
    for (const [i, p] of PACKS.entries()) {
      add(`P${i + 1}`, p.n, { pack: p.n }, round(price * p.price, 1000), Math.round(weight * p.w));
    }
  } else {
    add('01', 'Tiêu chuẩn', {}, price, weight);
  }
  const care = pick(r, [
    'Rửa sạch và lau khô sau mỗi lần dùng để giữ dụng cụ bền đẹp.',
    'Tránh dùng chất tẩy mạnh; rửa nhẹ bằng nước ấm và xà phòng dịu.',
    'Phù hợp để dùng hằng ngày tại nhà, văn phòng hoặc quán nhỏ.',
  ]);
  const brand = chance(r, 0.75) ? pick(r, TOOL_BRANDS).slug : null;
  return {
    slug: slugify(name),
    name,
    categorySlug: cat,
    brandSlug: brand,
    shortDesc: desc.length > 90 ? `${desc.slice(0, desc.lastIndexOf(' ', 87))}...` : desc,
    description: `${desc}\n\n- ${care}`,
    tags: tagsCsv.split(','),
    status: 'ACTIVE',
    isFeatured: index % 11 === 0,
    variants,
    stats: [int(r, 5, 80), 0, 0],
  };
}

/** 120 sản phẩm của seed nhiều. Cùng đầu vào luôn ra cùng kết quả (không phụ thuộc thời gian). */
export function buildRichProducts(): ProductSeed[] {
  return [...COFFEES.map((d, i) => coffeeProduct(d, i)), ...TOOLS.map((d, i) => toolProduct(d, i))];
}

export const RICH_PRODUCT_COUNT = COFFEES.length + TOOLS.length;
