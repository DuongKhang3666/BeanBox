/* Danh mục con và thương hiệu của seed nhiều (D-084). Thương hiệu là TÊN MINH HỌA, không dùng nhãn hiệu thật. */
import { slugify } from '../../../src/lib/slug.js';

export interface RichCategory {
  /** Slug danh mục gốc đã có ở seed cơ bản. */
  parentSlug: string;
  slug: string;
  name: string;
}

export const RICH_CATEGORIES: RichCategory[] = [
  { parentSlug: 'ca-phe-hat', slug: 'single-origin', name: 'Single Origin' },
  { parentSlug: 'ca-phe-hat', slug: 'ca-phe-rang-xay', name: 'Cà phê rang xay' },
  { parentSlug: 'ca-phe-hat', slug: 'ca-phe-tui-loc', name: 'Cà phê túi lọc' },
  { parentSlug: 'dung-cu-pha-che', slug: 'dung-cu-latte-art', name: 'Dụng cụ latte art' },
  { parentSlug: 'dung-cu-pha-che', slug: 'binh-cold-brew', name: 'Bình cold brew' },
  { parentSlug: 'phu-kien', slug: 'phu-kien-quay-bar', name: 'Phụ kiện quầy bar' },
  { parentSlug: 'phu-kien', slug: 'sach-an-pham', name: 'Sách & ấn phẩm' },
  { parentSlug: 'qua-tang-combo', slug: 'hop-qua-tang', name: 'Hộp quà tặng' },
  { parentSlug: 'qua-tang-combo', slug: 'combo-pha-che', name: 'Combo pha chế' },
];

const ROASTER_NAMES = [
  'Lò Rang Mộc',
  'Hạt Núi Coffee',
  'Sương Mai Roastery',
  'Gió Cao Nguyên',
  'Đất Đỏ Coffee Co.',
  'Nhà Rang Phố Cổ',
  'Rừng Xanh Roasters',
  'Bản Mường Coffee',
  'Hẻm Nhỏ Roastery',
  'Mùa Hạt Mới',
];
const TOOL_NAMES = [
  'Gốm Lò Nâu',
  'Xưởng Inox Phương Nam',
  'Tre Việt Studio',
  'Thủy Tinh Sao Mai',
  'Barista Phố',
  'Pha Chậm Studio',
  'Bếp Nhỏ Tools',
  'Cốc Cốc Home',
  'Kim Loại Đông Á',
  'Nhà Giấy Lọc',
];

export interface RichBrand {
  slug: string;
  name: string;
}

export const ROASTER_BRANDS: RichBrand[] = ROASTER_NAMES.map((name) => ({
  slug: slugify(name),
  name,
}));
export const TOOL_BRANDS: RichBrand[] = TOOL_NAMES.map((name) => ({ slug: slugify(name), name }));
export const RICH_BRANDS: RichBrand[] = [...ROASTER_BRANDS, ...TOOL_BRANDS];
