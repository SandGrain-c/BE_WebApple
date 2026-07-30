// src/modules/admin-product-item/admin-product-item.dto.ts

export type ProductItemStatus =
  | "InStock"
  | "Reserved"
  | "Sold"
  | "Warranty"
  | "Returned"
  | "Inactive";

/**
 * Mapping status API -> DB.
 * DB của bạn đang lưu status dạng number.
 */
export const PRODUCT_ITEM_STATUS_TO_DB = {
  InStock: 1,
  Reserved: 2,
  Sold: 3,
  Warranty: 4,
  Returned: 5,
  Inactive: 6,
} as const;

/**
 * Mapping status DB -> API.
 */
export const DB_PRODUCT_ITEM_STATUS_TO_API = {
  1: "InStock",
  2: "Reserved",
  3: "Sold",
  4: "Warranty",
  5: "Returned",
  6: "Inactive",
} as const;

export type GetAdminProductItemsQuery = {
  q?: string;
  status?: ProductItemStatus;
  variantId?: string | number;
  productId?: string | number;
  page?: string | number;
  limit?: string | number;
};

export type CreateProductItemBody = {
  variantId?: number;
  serialNumber?: string;
  
  status?: ProductItemStatus;
};

export type UpdateProductItemBody = {
  variantId?: number;
  serialNumber?: string;
  
  status?: ProductItemStatus;
};

export type AdminProductItemDto = {
  productItemId: number;
  variantId: number;

  serialNumber: string;
 
  status: ProductItemStatus;

  product: {
    productId: number;
    name: string;
    slug: string;
    categorySlug: string;
  } | null;

  variant: {
    sku: string;
    color: string;
    capacity: string;
    ram: string;
    price: number;
    stockQuantity: number;
  } | null;

  createdAt: string | null;
};

export type AdminProductItemListResponseDto = {
  items: AdminProductItemDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};