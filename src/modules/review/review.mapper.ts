import { ReviewDto } from "./review.dto";

/**
 * Chuyển Date sang ISO string.
 */
const toISOString = (value: any): string => {
  return value?.toISOString?.() ?? String(value);
};

/**
 * mapReviewToDto:
 * Chuyển dữ liệu review từ DB sang DTO cho FE.
 */
export const mapReviewToDto = (review: any): ReviewDto => {
  return {
    reviewId: review.review_id,
    productId: review.product_id,
    productName: review.products?.name ?? "",
    productSlug: review.products?.slug ?? "",
    userId: review.user_id,
    userName: review.users?.user_name ?? "",
    fullName: review.users?.full_name ?? "",
    rating: review.rating,
    comment: review.comment,
    isActive: review.is_active,
    createdAt: toISOString(review.created_at),
  };
};