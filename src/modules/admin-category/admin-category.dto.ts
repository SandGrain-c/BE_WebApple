// src/modules/admin-category/admin-category.dto.ts

export type AdminCategoryDto = {
    categoryId: number;
    categoryName: string;
    slug: string;
    description: string | null;
    displayOrder: number;
    isActive: boolean;
    totalProducts: number;
  };
  
  export type AdminCategoryListResponseDto = {
    items: AdminCategoryDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminCategoriesQuery = {
    search?: string;
    isActive?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type CreateAdminCategoryBody = {
    categoryName: string;
    slug?: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  };
  
  export type UpdateAdminCategoryBody = {
    categoryName?: string;
    slug?: string;
    description?: string | null;
    displayOrder?: number;
    isActive?: boolean;
  };