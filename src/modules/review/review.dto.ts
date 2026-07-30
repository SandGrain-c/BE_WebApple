export type ReviewDto = {
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
  
  export type ReviewSummaryDto = {
    productId: number;
    totalReviews: number;
    averageRating: number;
    ratingCounts: {
      rating: number;
      count: number;
    }[];
  };
  
  export type ProductReviewsResponseDto = {
    summary: ReviewSummaryDto;
    items: ReviewDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetProductReviewsQuery = {
    page?: string;
    limit?: string;
    rating?: string;
  };
  
  export type CreateReviewBody = {
    productId: number;
    rating: number;
    comment?: string | null;
  };
  
  export type UpdateReviewBody = {
    rating?: number;
    comment?: string | null;
  };