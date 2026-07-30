// src/modules/admin-category/admin-category.mapper.ts

import { AdminCategoryDto } from "./admin-category.dto";

/**
 * mapAdminCategoryToDto:
 * Chuyển dữ liệu Prisma từ snake_case sang camelCase cho FE Admin.
 */
export const mapAdminCategoryToDto = (category: any): AdminCategoryDto => {
  return {
    categoryId: category.category_id,
    categoryName: category.category_name,
    slug: category.slug,
    description: category.description,
    displayOrder: category.display_order,
    isActive: category.is_active,
    totalProducts: category._count?.products ?? 0,
  };
};