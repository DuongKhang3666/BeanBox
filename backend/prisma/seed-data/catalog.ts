/* Dữ liệu mẫu cho môi trường dev: danh mục và thương hiệu. Module thuần dữ liệu (không chạm DB). */

export interface CategorySeed {
  slug: string;
  name: string;
  children?: { slug: string; name: string }[];
}

export const CATEGORIES: CategorySeed[] = [
  {
    slug: 'ca-phe-hat',
    name: 'Cà phê hạt',
    children: [
      { slug: 'specialty', name: 'Specialty' },
      { slug: 'ca-phe-viet', name: 'Cà phê Việt' },
      { slug: 'blend', name: 'Blend' },
      { slug: 'decaf', name: 'Decaf' },
    ],
  },
  {
    slug: 'dung-cu-pha-che',
    name: 'Dụng cụ pha chế',
    children: [
      { slug: 'phin', name: 'Phin' },
      { slug: 'pour-over', name: 'Pour-over' },
      { slug: 'french-press-aeropress-moka-pot', name: 'French Press, AeroPress & Moka Pot' },
      { slug: 'may-xay', name: 'Máy xay' },
      { slug: 'am-rot-can-nhiet-ke', name: 'Ấm rót, cân & nhiệt kế' },
    ],
  },
  {
    slug: 'phu-kien',
    name: 'Phụ kiện',
    children: [
      { slug: 'giay-loc', name: 'Giấy lọc' },
      { slug: 'ly-coc-binh-giu-nhiet', name: 'Ly, cốc & bình giữ nhiệt' },
      { slug: 'hop-bao-quan-ve-sinh', name: 'Hộp bảo quản & vệ sinh' },
    ],
  },
  { slug: 'qua-tang-combo', name: 'Quà tặng & Combo' },
];

export const BRANDS = [
  { slug: 'beanbox-roastery', name: 'BeanBox Roastery' },
  { slug: 'hario', name: 'Hario' },
  { slug: 'kalita', name: 'Kalita' },
  { slug: 'chemex', name: 'Chemex' },
  { slug: 'aeropress', name: 'AeroPress' },
  { slug: 'bialetti', name: 'Bialetti' },
  { slug: 'timemore', name: 'Timemore' },
];

/** Slug danh mục gốc của một slug bất kỳ (gốc hoặc con); undefined nếu không tồn tại. */
export function rootCategorySlug(slug: string): string | undefined {
  for (const c of CATEGORIES) {
    if (c.slug === slug || c.children?.some((ch) => ch.slug === slug)) return c.slug;
  }
  return undefined;
}
