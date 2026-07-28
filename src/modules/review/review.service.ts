import prisma from "../../utils/prisma";
import {
  CreateReviewBody,
  GetProductReviewsQuery,
  ProductReviewsResponseDto,
  ReviewDto,
  UpdateReviewBody,
} from "./review.dto";
import { mapReviewToDto } from "./review.mapper";

export class ReviewServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const reviewInclude = {
  products: {
    select: {
      product_id: true,
      name: true,
      slug: true,
    },
  },
  users: {
    select: {
      user_id: true,
      user_name: true,
      full_name: true,
    },
  },
};

/**
 * Chuẩn hóa text.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Kiểm tra user đã đăng nhập chưa.
 */
const validateUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new ReviewServiceError("Bạn chưa đăng nhập", 401);
  }
};

/**
 * Kiểm tra rating hợp lệ: 1 đến 5 sao.
 */
const validateRating = (rating: number) => {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ReviewServiceError("Số sao đánh giá phải từ 1 đến 5", 400);
  }
};

/**
 * Kiểm tra sản phẩm tồn tại.
 */
const ensureProductExists = async (productId: number) => {
  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
      is_active: true,
    },
  });

  if (!product) {
    throw new ReviewServiceError("Không tìm thấy sản phẩm", 404);
  }

  if (!product.is_active) {
    throw new ReviewServiceError("Sản phẩm hiện không còn hoạt động", 400);
  }

  return product;
};

/**
 * Kiểm tra user đã mua sản phẩm và đơn đã Completed chưa.
 */
const ensureUserPurchasedProduct = async (userId: number, productId: number) => {
  const completedOrder = await prisma.orders.findFirst({
    where: {
      user_id: userId,
      order_status: "Completed",
      order_details: {
        some: {
          product_variants: {
            product_id: productId,
          },
        },
      },
    },
    select: {
      order_id: true,
    },
  });

  if (!completedOrder) {
    throw new ReviewServiceError(
      "Bạn chỉ có thể đánh giá sản phẩm đã mua và đơn hàng đã hoàn thành",
      403
    );
  }
};

/**
 * GET /api/products/:productId/reviews
 * Lấy review public của sản phẩm.
 */
export const getProductReviewsService = async (
  productId: number,
  query: GetProductReviewsQuery
): Promise<ProductReviewsResponseDto> => {
  if (!productId || Number.isNaN(productId)) {
    throw new ReviewServiceError("productId không hợp lệ", 400);
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const where: any = {
    product_id: productId,
    is_active: true,
  };

  if (query.rating !== undefined) {
    const rating = Number(query.rating);

    if (Number.isNaN(rating)) {
      throw new ReviewServiceError("rating không hợp lệ", 400);
    }

    validateRating(rating);
    where.rating = rating;
  }

  const [items, totalItems, allActiveReviews, ratingGroups] =
    await Promise.all([
      prisma.reviews.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          created_at: "desc",
        },
        include: reviewInclude,
      }),

      prisma.reviews.count({
        where,
      }),

      prisma.reviews.findMany({
        where: {
          product_id: productId,
          is_active: true,
        },
        select: {
          rating: true,
        },
      }),

      prisma.reviews.groupBy({
        by: ["rating"],
        where: {
          product_id: productId,
          is_active: true,
        },
        _count: {
          rating: true,
        },
      }),
    ]);

  const totalReviews = allActiveReviews.length;

  const averageRating =
    totalReviews === 0
      ? 0
      : Number(
          (
            allActiveReviews.reduce((sum, item) => sum + item.rating, 0) /
            totalReviews
          ).toFixed(1)
        );

  const ratingCounts = [5, 4, 3, 2, 1].map((rating) => {
    const found = ratingGroups.find((item) => item.rating === rating);

    return {
      rating,
      count: found?._count.rating ?? 0,
    };
  });

  return {
    summary: {
      productId,
      totalReviews,
      averageRating,
      ratingCounts,
    },
    items: items.map(mapReviewToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * POST /api/reviews
 * Customer tạo review.
 */
export const createReviewService = async (
  userId: number,
  body: CreateReviewBody
): Promise<ReviewDto> => {
  validateUserId(userId);

  const productId = Number(body.productId);
  const rating = Number(body.rating);
  const comment = normalizeText(body.comment);

  if (!productId || Number.isNaN(productId)) {
    throw new ReviewServiceError("productId không hợp lệ", 400);
  }

  validateRating(rating);

  await ensureProductExists(productId);
  await ensureUserPurchasedProduct(userId, productId);

  /**
   * Mỗi user chỉ được review 1 lần cho 1 product.
   */
  const existedReview = await prisma.reviews.findFirst({
    where: {
      user_id: userId,
      product_id: productId,
    },
    select: {
      review_id: true,
    },
  });

  if (existedReview) {
    throw new ReviewServiceError("Bạn đã đánh giá sản phẩm này rồi", 409);
  }

  const createdReview = await prisma.reviews.create({
    data: {
      user_id: userId,
      product_id: productId,
      rating,
      comment,
      is_active: true,
    },
    include: reviewInclude,
  });

  return mapReviewToDto(createdReview);
};

/**
 * PATCH /api/reviews/:reviewId
 * Customer sửa review của mình.
 */
export const updateMyReviewService = async (
  userId: number,
  reviewId: number,
  body: UpdateReviewBody
): Promise<ReviewDto> => {
  validateUserId(userId);

  if (!reviewId || Number.isNaN(reviewId)) {
    throw new ReviewServiceError("reviewId không hợp lệ", 400);
  }

  const existedReview = await prisma.reviews.findFirst({
    where: {
      review_id: reviewId,
      user_id: userId,
    },
    select: {
      review_id: true,
    },
  });

  if (!existedReview) {
    throw new ReviewServiceError("Không tìm thấy đánh giá của bạn", 404);
  }

  const data: any = {};

  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    validateRating(rating);
    data.rating = rating;
  }

  if (body.comment !== undefined) {
    data.comment = normalizeText(body.comment);
  }

  const updatedReview = await prisma.reviews.update({
    where: {
      review_id: reviewId,
    },
    data,
    include: reviewInclude,
  });

  return mapReviewToDto(updatedReview);
};

/**
 * DELETE /api/reviews/:reviewId
 * Customer xóa mềm review của mình.
 */
export const deleteMyReviewService = async (
  userId: number,
  reviewId: number
): Promise<ReviewDto> => {
  validateUserId(userId);

  if (!reviewId || Number.isNaN(reviewId)) {
    throw new ReviewServiceError("reviewId không hợp lệ", 400);
  }

  const existedReview = await prisma.reviews.findFirst({
    where: {
      review_id: reviewId,
      user_id: userId,
    },
    include: reviewInclude,
  });

  if (!existedReview) {
    throw new ReviewServiceError("Không tìm thấy đánh giá của bạn", 404);
  }

  const deletedReview = await prisma.reviews.update({
    where: {
      review_id: reviewId,
    },
    data: {
      is_active: false,
    },
    include: reviewInclude,
  });

  return mapReviewToDto(deletedReview);
};