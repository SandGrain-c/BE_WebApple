// src/modules/product-image/product-image.dto.ts

export type ProductImageDto = {
    imageId: number;
    productId: number;
    variantId: number | null;
    color: string;
    imageUrl: string;
    altText: string | null;
    isThumbnail: boolean;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    cloudinaryPublicId: string | null;
  };
  
  export type CreateProductImagePayload = {
    color?: string | null;
    variantId?: string | number | null;
    altText?: string | null;
    isThumbnail?: string | boolean | null;
    sortOrder?: string | number | null;
    isActive?: string | boolean | null;
  };
  
  export type UpdateProductImagePayload = {
    color?: string | null;
    variantId?: string | number | null;
    altText?: string | null;
    isThumbnail?: string | boolean | null;
    sortOrder?: string | number | null;
    isActive?: string | boolean | null;
  };

  export type CreateManyProductImagesBody = {
    variantId?: string;
    color?: string;
    altText?: string;
    thumbnailIndex?: string;
    sortOrderStart?: string;
    isActive?: string;
  };