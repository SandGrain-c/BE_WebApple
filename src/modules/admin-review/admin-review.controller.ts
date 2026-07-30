import { Request, Response } from "express";

import {
  AdminReviewServiceError,
  deleteAdminReviewService,
  getAdminReviewDetailService,
  getAdminReviewsService,
  updateReviewVisibilityService,
} from "./admin-review.service";
import {
  GetAdminReviewsQuery,
  UpdateReviewVisibilityBody,
} from "./admin-review.dto";

const handleAdminReviewError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminReviewServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý đánh giá thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/reviews
 */
export const getAdminReviewsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminReviewsService(
      req.query as GetAdminReviewsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách đánh giá admin thành công",
      data,
    });
  } catch (error) {
    return handleAdminReviewError(res, error);
  }
};

/**
 * GET /api/admin/reviews/:reviewId
 */
export const getAdminReviewDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const reviewId = Number(req.params.reviewId);
    const data = await getAdminReviewDetailService(reviewId);

    return res.json({
      success: true,
      message: "Lấy chi tiết đánh giá thành công",
      data,
    });
  } catch (error) {
    return handleAdminReviewError(res, error);
  }
};

/**
 * PATCH /api/admin/reviews/:reviewId/visibility
 */
export const updateReviewVisibilityController = async (
  req: Request,
  res: Response
) => {
  try {
    const reviewId = Number(req.params.reviewId);

    const data = await updateReviewVisibilityService(
      reviewId,
      req.body as UpdateReviewVisibilityBody
    );

    return res.json({
      success: true,
      message: "Cập nhật trạng thái đánh giá thành công",
      data,
    });
  } catch (error) {
    return handleAdminReviewError(res, error);
  }
};

/**
 * DELETE /api/admin/reviews/:reviewId
 */
export const deleteAdminReviewController = async (
  req: Request,
  res: Response
) => {
  try {
    const reviewId = Number(req.params.reviewId);
    const data = await deleteAdminReviewService(reviewId);

    return res.json({
      success: true,
      message: "Xóa mềm đánh giá thành công",
      data,
    });
  } catch (error) {
    return handleAdminReviewError(res, error);
  }
};