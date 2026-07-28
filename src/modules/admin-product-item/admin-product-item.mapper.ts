// src/modules/admin-product-item/admin-product-item.mapper.ts

import type {
    AdminProductItemDto,
    ProductItemStatus,
  } from "./admin-product-item.dto";
  import { DB_PRODUCT_ITEM_STATUS_TO_API } from "./admin-product-item.dto";
  
  const mapDbStatusToApi = (status: number): ProductItemStatus => {
    return (
      DB_PRODUCT_ITEM_STATUS_TO_API[
        status as keyof typeof DB_PRODUCT_ITEM_STATUS_TO_API
      ] ?? "Inactive"
    );
  };
  
  export const mapAdminProductItemToDto = (item: any): AdminProductItemDto => {
    const variant = item.product_variants ?? null;
    const product = variant?.products ?? null;
  
    return {
      productItemId: item.item_id,
      variantId: item.variant_id,
  
      serialNumber: item.serial_number,

      status: mapDbStatusToApi(item.status),
  
      product: product
        ? {
            productId: product.product_id,
            name: product.name,
            slug: product.slug,
            categorySlug: product.categories?.slug ?? "",
          }
        : null,
  
      variant: variant
        ? {
            sku: variant.sku,
            color: variant.color,
            capacity: variant.capacity,
            ram: variant.ram,
            price: Number(variant.price),
            stockQuantity: variant.stock_quantity,
          }
        : null,
  
      createdAt: item.created_at ? item.created_at.toISOString() : null,
    };
  };