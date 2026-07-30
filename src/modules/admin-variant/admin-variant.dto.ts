// src/modules/admin-variant/admin-variant.dto.ts

export type AdminVariantDto = {
    variantId: number;
    productId: number;
    productName: string;
    productSlug: string;
    sku: string;
    variantName: string | null;
    color: string | null;
    capacity: string | null;
    ram: string | null;
    country: string | null;
    price: number;
    oldPrice: number | null;
    installment: string | null;
    discountLabel: string | null;
    stockQuantity: number;
  };
  
  export type CreateAdminVariantBody = {
    variantName?: string | null;
    sku: string;
    color?: string | null;
    capacity?: string | null;
    ram?: string | null;
    country?: string | null;
    price: number;
    oldPrice?: number | null;
    installment?: string | null;
    discountLabel?: string | null;
    stockQuantity?: number;
  };
  
  export type UpdateAdminVariantBody = {
    variantName?: string | null;
    sku?: string;
    color?: string | null;
    capacity?: string | null;
    ram?: string | null;
    country?: string | null;
    price?: number;
    oldPrice?: number | null;
    installment?: string | null;
    discountLabel?: string | null;
    stockQuantity?: number;
  };