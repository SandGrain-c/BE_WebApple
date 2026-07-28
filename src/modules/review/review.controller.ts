import { Request, Response } from "express";

import {
  createReviewService,
  deleteMyReviewService,
  getProductReviewsService,
  ReviewServiceError,
  updateMyReviewService,
} from "./review.service";
import {
  CreateReviewBody,
  GetProductReviewsQuery,
  UpdateReviewBody,
} from "./review.dto";

const getUserIdFromRequest = (req: Request) => {
  return Number((req as any).user?.userId);
};

const handleReviewError = (res: Response, error: unknown) => {
  const statusCode = error instanceof ReviewServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý đánh giá thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/products/:productId/reviews
 */
export const getProductReviewsController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);

    const data = await getProductReviewsService(
      productId,
      req.query as GetProductReviewsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách đánh giá sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

/**
 * POST /api/reviews
 */
export const createReviewController = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);

    const data = await createReviewService(
      userId,
      req.body as CreateReviewBody
    );

    return res.status(201).json({
      success: true,
      message: "Đánh giá sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

/**
 * PATCH /api/reviews/:reviewId
 */
export const updateMyReviewController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const reviewId = Number(req.params.reviewId);

    const data = await updateMyReviewService(
      userId,
      reviewId,
      req.body as UpdateReviewBody
    );

    return res.json({
      success: true,
      message: "Cập nhật đánh giá thành công",
      data,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

/**
 * DELETE /api/reviews/:reviewId
 */
export const deleteMyReviewController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const reviewId = Number(req.params.reviewId);

    const data = await deleteMyReviewService(userId, reviewId);

    return res.json({
      success: true,
      message: "Xóa đánh giá thành công",
      data,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};