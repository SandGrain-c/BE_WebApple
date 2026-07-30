import { AdminReviewDto } from "./admin-review.dto";

const toISOString = (value: any): string => {
  return value?.toISOString?.() ?? String(value);
};

export const mapAdminReviewToDto = (review: any): AdminReviewDto => {
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