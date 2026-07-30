// src/modules/product/product.dto.ts

export type StockStatusDto = "in-stock" | "out-of-stock";

export type ProductVariantImageDto = {
  imageId: number;
  imageUrl: string;
  altText: string | null;
  isThumbnail: boolean;
  sortOrder: number;
};

export type ProductVariantDto = {
  variantId: number;
  sku: string;
  color: string;
  capacity: string;
  ram: string;
  country: string | null;
  price: number;
  stockQuantity: number;
  stockStatus: StockStatusDto;
  images: ProductVariantImageDto[];
};

export type ProductCardItemDto = {
  id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  oldPrice: number | null;
  discountLabel: string | null;
  installment: string | null;
  promotions: string[];
  categorySlug: string;
  categoryName: string;
  colors: string[];
  capacities: string[];
  ramOptions: string[];
  stockQuantity: number;
  stockStatus: StockStatusDto;
  sold: number;
  createdAt: string;
  variants: ProductVariantDto[];
};

export type ProductFiltersDto = {
  colors: string[];
  capacities: string[];
  ramOptions: string[];
  priceRange: {
    min: number;
    max: number;
  };
};

export type ProductPaginationDto = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};

export type ProductListResponseDto = {
  items: ProductCardItemDto[];
  pagination: ProductPaginationDto;
  filters: ProductFiltersDto;
};

export type ProductDetailImageDto = {
  imageId: number;
  productId: number;
  variantId?: number | null;
  color: string;
  imageUrl: string;
  altText: string | null;
  isThumbnail: boolean;
  sortOrder: number;
};

export type ProductSpecificationItemDto = {
  label: string;
  value: string;
};

export type ProductSpecificationGroupDto = {
  groupName: string;
  items: ProductSpecificationItemDto[];
};

export type ProductDetailDto = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  price: number;
  oldPrice: number | null;
  discountLabel: string | null;
  installment: string | null;
  promotions: string[];
  images: ProductDetailImageDto[];
  variants: ProductVariantDto[];
  specifications: ProductSpecificationGroupDto[];
  colors: string[];
  capacities: string[];
  ramOptions: string[];
  stockQuantity: number;
  stockStatus: StockStatusDto;
  sold: number;
  ratingAverage: number;
  reviewCount: number;
  isActive: boolean;
  createdAt: string;
};

export type ProductDetailResponseDto = {
  product: ProductDetailDto;
  relatedProducts: ProductCardItemDto[];
};

export type ProductSearchSuggestQuery = {
  q?: string;
  limit?: string | number;
};

export type ProductSearchSuggestItemDto = {
  id: number;
  name: string;
  slug: string;
  categorySlug: string;
  image: string;
  price: number;
};

export type ProductSearchSuggestResponseDto = {
  items: ProductSearchSuggestItemDto[];
};