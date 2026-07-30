export type AdminReviewDto = {
    reviewId: number;
    productId: number;
    productName: string;
    productSlug: string;
    userId: number;
    userName: string;
    fullName: string;
    rating: number;
    comment: string | null;
    isActive: boolean;
    createdAt: string;
  };
  
  export type AdminReviewListResponseDto = {
    items: AdminReviewDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminReviewsQuery = {
    search?: string;
    productId?: string;
    userId?: string;
    rating?: string;
    isActive?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type UpdateReviewVisibilityBody = {
    isActive: boolean;
  };