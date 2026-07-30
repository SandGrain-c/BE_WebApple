//src/modules/admin-variant/admin-variant.mapper.ts

import { AdminVariantDto } from "./admin-variant.dto";

/**
 * Chuyển Decimal của Prisma sang number cho FE dễ dùng.
 */
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

/**
 * mapAdminVariantToDto:
 * Chuyển dữ liệu variant từ DB sang DTO cho Admin FE.
 */
export const mapAdminVariantToDto = (variant: any): AdminVariantDto => {
  return {
    variantId: variant.variant_id,
    productId: variant.product_id,
    productName: variant.products?.name ?? "",
    productSlug: variant.products?.slug ?? "",
    sku: variant.sku,
    variantName: variant.variant_name,
    color: variant.color,
    capacity: variant.capacity,
    ram: variant.ram,
    country: variant.country,
    price: toNumber(variant.price),
    oldPrice: variant.old_price === null ? null : toNumber(variant.old_price),
    installment: variant.installment,
    discountLabel: variant.discount_label,
    stockQuantity: variant.stock_quantity,
  };
};