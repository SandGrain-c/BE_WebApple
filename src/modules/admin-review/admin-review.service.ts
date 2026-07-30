import prisma from "../../utils/prisma";
import {
  AdminReviewDto,
  AdminReviewListResponseDto,
  GetAdminReviewsQuery,
  UpdateReviewVisibilityBody,
} from "./admin-review.dto";
import { mapAdminReviewToDto } from "./admin-review.mapper";

export class AdminReviewServiceError extends Error {
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

const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const validateRating = (rating: number) => {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AdminReviewServiceError("rating phải từ 1 đến 5", 400);
  }
};

/**
 * GET /api/admin/reviews
 * Admin lấy danh sách review.
 */
export const getAdminReviewsService = async (
  query: GetAdminReviewsQuery
): Promise<AdminReviewListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);

  const where: any = {};

  if (search) {
    where.OR = [
      {
        comment: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        products: {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        users: {
          full_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        users: {
          user_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  if (query.productId !== undefined) {
    const productId = Number(query.productId);

    if (Number.isNaN(productId)) {
      throw new AdminReviewServiceError("productId không hợp lệ", 400);
    }

    where.product_id = productId;
  }

  if (query.userId !== undefined) {
    const userId = Number(query.userId);

    if (Number.isNaN(userId)) {
      throw new AdminReviewServiceError("userId không hợp lệ", 400);
    }

    where.user_id = userId;
  }

  if (query.rating !== undefined) {
    const rating = Number(query.rating);

    if (Number.isNaN(rating)) {
      throw new AdminReviewServiceError("rating không hợp lệ", 400);
    }

    validateRating(rating);
    where.rating = rating;
  }

  if (query.isActive === "true") {
    where.is_active = true;
  }

  if (query.isActive === "false") {
    where.is_active = false;
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "rating_asc":
      orderBy = { rating: "asc" };
      break;
    case "rating_desc":
      orderBy = { rating: "desc" };
      break;
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [items, totalItems] = await Promise.all([
    prisma.reviews.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: reviewInclude,
    }),

    prisma.reviews.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminReviewToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/reviews/:reviewId
 */
export const getAdminReviewDetailService = async (
  reviewId: number
): Promise<AdminReviewDto> => {
  if (!reviewId || Number.isNaN(reviewId)) {
    throw new AdminReviewServiceError("reviewId không hợp lệ", 400);
  }

  const review = await prisma.reviews.findUnique({
    where: {
      review_id: reviewId,
    },
    include: reviewInclude,
  });

  if (!review) {
    throw new AdminReviewServiceError("Không tìm thấy đánh giá", 404);
  }

  return mapAdminReviewToDto(review);
};

/**
 * PATCH /api/admin/reviews/:reviewId/visibility
 * Admin ẩn/hiện review.
 */
export const updateReviewVisibilityService = async (
  reviewId: number,
  body: UpdateReviewVisibilityBody
): Promise<AdminReviewDto> => {
  if (!reviewId || Number.isNaN(reviewId)) {
    throw new AdminReviewServiceError("reviewId không hợp lệ", 400);
  }

  if (typeof body.isActive !== "boolean") {
    throw new AdminReviewServiceError("isActive phải là boolean", 400);
  }

  const existedReview = await prisma.reviews.findUnique({
    where: {
      review_id: reviewId,
    },
    select: {
      review_id: true,
    },
  });

  if (!existedReview) {
    throw new AdminReviewServiceError("Không tìm thấy đánh giá", 404);
  }

  const updatedReview = await prisma.reviews.update({
    where: {
      review_id: reviewId,
    },
    data: {
      is_active: body.isActive,
    },
    include: reviewInclude,
  });

  return mapAdminReviewToDto(updatedReview);
};

/**
 * DELETE /api/admin/reviews/:reviewId
 * Admin xóa mềm review.
 */
export const deleteAdminReviewService = async (
  reviewId: number
): Promise<AdminReviewDto> => {
  if (!reviewId || Number.isNaN(reviewId)) {
    throw new AdminReviewServiceError("reviewId không hợp lệ", 400);
  }

  const existedReview = await prisma.reviews.findUnique({
    where: {
      review_id: reviewId,
    },
    include: reviewInclude,
  });

  if (!existedReview) {
    throw new AdminReviewServiceError("Không tìm thấy đánh giá", 404);
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

  return mapAdminReviewToDto(deletedReview);
};