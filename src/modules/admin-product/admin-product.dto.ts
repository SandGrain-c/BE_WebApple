
// src/modules/admin-product/admin-product.dto.ts
export type AdminProductVariantSummaryDto = {
    variantId: number;
    sku: string;
    color: string | null;
    capacity: string | null;
    ram: string | null;
    price: number;
    oldPrice: number | null;
    stockQuantity: number;
  };
  
  export type AdminProductDto = {
    productId: number;
    categoryId: number;
    categoryName: string;
    categorySlug: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    variants: AdminProductVariantSummaryDto[];
    totalVariants: number;
    totalImages: number;
  };
  
  export type AdminProductListResponseDto = {
    items: AdminProductDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminProductsQuery = {
    search?: string;
    categoryId?: string;
    categorySlug?: string;
    isActive?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type CreateAdminProductBody = {
    categoryId: number;
    name: string;
    slug?: string;
    description?: string | null;
    isActive?: boolean;
  };
  
  export type UpdateAdminProductBody = {
    categoryId?: number;
    name?: string;
    slug?: string;
    description?: string | null;
    isActive?: boolean;
  };