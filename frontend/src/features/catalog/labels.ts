import type {
  BrewMethod,
  CoffeeProcess,
  ProductSort,
  RoastLevel,
  StockStatus,
} from "@/types/catalog";

export const ROAST_LABELS: Record<RoastLevel, string> = {
  LIGHT: "Rang sáng",
  MEDIUM: "Rang vừa",
  MEDIUM_DARK: "Rang vừa đậm",
  DARK: "Rang đậm",
};

export const PROCESS_LABELS: Record<CoffeeProcess, string> = {
  WASHED: "Sơ chế ướt (Washed)",
  NATURAL: "Sơ chế khô (Natural)",
  HONEY: "Honey",
  ANAEROBIC: "Lên men yếm khí",
  OTHER: "Khác",
};

export const BREW_LABELS: Record<BrewMethod, string> = {
  PHIN: "Phin",
  ESPRESSO: "Espresso",
  POUR_OVER: "Pour-over",
  COLD_BREW: "Cold brew",
  FRENCH_PRESS: "French press",
  AEROPRESS: "AeroPress",
  MOKA: "Moka pot",
};

export const SORT_LABELS: Record<ProductSort, string> = {
  newest: "Mới nhất",
  price_asc: "Giá tăng dần",
  price_desc: "Giá giảm dần",
  bestseller: "Bán chạy",
  rating: "Đánh giá cao",
  relevance: "Liên quan nhất",
};

export const STOCK_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "Còn hàng",
  LOW_STOCK: "Sắp hết hàng",
  OUT_OF_STOCK: "Hết hàng",
};

export const ROAST_VALUES = Object.keys(ROAST_LABELS) as RoastLevel[];
export const PROCESS_VALUES = Object.keys(PROCESS_LABELS) as CoffeeProcess[];
export const BREW_VALUES = Object.keys(BREW_LABELS) as BrewMethod[];
export const SORT_VALUES = Object.keys(SORT_LABELS) as ProductSort[];
