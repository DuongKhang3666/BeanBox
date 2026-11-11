export interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}

export interface AdminCategoryDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface AdminCategoryNode extends AdminCategoryDto {
  children: AdminCategoryNode[];
}

/** `_count.products` phải đếm sản phẩm chưa xóa mềm (xem `categoryInclude`). */
export function toAdminCategory(r: CategoryRow): AdminCategoryDto {
  return {
    id: r.id,
    parentId: r.parentId,
    name: r.name,
    slug: r.slug,
    description: r.description,
    imageUrl: r.imageUrl,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    productCount: r._count.products,
  };
}

/** Cây 2 cấp; `rows` đã được sắp theo sortOrder, name. */
export function buildCategoryTree(rows: CategoryRow[]): AdminCategoryNode[] {
  const roots: AdminCategoryNode[] = [];
  const byId = new Map<string, AdminCategoryNode>();
  for (const r of rows) {
    if (r.parentId === null) {
      const node = { ...toAdminCategory(r), children: [] };
      byId.set(r.id, node);
      roots.push(node);
    }
  }
  for (const r of rows) {
    if (r.parentId !== null) {
      byId.get(r.parentId)?.children.push({ ...toAdminCategory(r), children: [] });
    }
  }
  return roots;
}

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { products: number };
}

export interface AdminBrandDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toAdminBrand(r: BrandRow): AdminBrandDto {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    logoUrl: r.logoUrl,
    productCount: r._count.products,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
