// src/modules/admin-product/admin-product.mapper.ts

import { AdminProductDto } from "./admin-product.dto";

/**
 * Chuyển Decimal/String/Null sang number an toàn.
 */
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

/**
 * mapAdminProductToDto:
 * Chuyển dữ liệu Prisma dạng snake_case sang DTO camelCase cho FE Admin.
 */
export const mapAdminProductToDto = (product: any): AdminProductDto => {
  return {
    productId: product.product_id,
    categoryId: product.category_id,
    categoryName: product.categories?.category_name ?? "",
    categorySlug: product.categories?.slug ?? "",
    name: product.name,
    slug: product.slug,
    description: product.description,
    isActive: product.is_active,
    createdAt: product.created_at?.toISOString?.() ?? String(product.created_at),

    variants: (product.product_variants ?? []).map((variant: any) => ({
      variantId: variant.variant_id,
      sku: variant.sku,
      color: variant.color,
      capacity: variant.capacity,
      ram: variant.ram,
      price: toNumber(variant.price),
      oldPrice: variant.old_price === null ? null : toNumber(variant.old_price),
      stockQuantity: variant.stock_quantity,
    })),

    totalVariants: product._count?.product_variants ?? 0,
    totalImages: product._count?.product_images ?? 0,
  };
};