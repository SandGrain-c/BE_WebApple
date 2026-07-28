// src/modules/product-image/product-image.mapper.ts

import type { ProductImageDto } from "./product-image.dto";

export const mapProductImageToDto = (image: any): ProductImageDto => {
  return {
    imageId: image.image_id,
    productId: image.product_id,
    variantId: image.variant_id,
    color: image.color,
    imageUrl: image.image_url,
    altText: image.alt_text,
    isThumbnail: image.is_thumbnail,
    sortOrder: image.sort_order,
    isActive: image.is_active,
    createdAt: image.created_at?.toISOString?.() ?? String(image.created_at),
    cloudinaryPublicId: image.cloudinary_public_id ?? null,
  };
};