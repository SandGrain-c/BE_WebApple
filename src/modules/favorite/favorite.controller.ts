import { Request, Response } from "express";

import {
  addMyFavoriteService,
  checkMyFavoriteService,
  FavoriteServiceError,
  getMyFavoritesService,
  removeMyFavoriteService,
} from "./favorite.service";

/**
 * Lấy userId từ authMiddleware.
 */
const getUserIdFromRequest = (req: Request) => {
  return Number((req as any).user?.userId);
};

/**
 * Xử lý lỗi chung cho Favorite Controller.
 */
const handleFavoriteError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof FavoriteServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý sản phẩm yêu thích thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/favorites
 */
export const getMyFavoritesController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await getMyFavoritesService(userId);

    return res.json({
      success: true,
      message: "Lấy danh sách sản phẩm yêu thích thành công",
      data,
    });
  } catch (error) {
    return handleFavoriteError(res, error);
  }
};

/**
 * POST /api/favorites/:productId
 */
export const addMyFavoriteController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const productId = Number(req.params.productId);

    const data = await addMyFavoriteService(userId, productId);

    return res.status(201).json({
      success: true,
      message: "Thêm sản phẩm vào yêu thích thành công",
      data,
    });
  } catch (error) {
    return handleFavoriteError(res, error);
  }
};

/**
 * DELETE /api/favorites/:productId
 */
export const removeMyFavoriteController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const productId = Number(req.params.productId);

    const data = await removeMyFavoriteService(userId, productId);

    return res.json({
      success: true,
      message: "Bỏ yêu thích sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleFavoriteError(res, error);
  }
};

/**
 * GET /api/favorites/check/:productId
 */
export const checkMyFavoriteController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const productId = Number(req.params.productId);

    const data = await checkMyFavoriteService(userId, productId);

    return res.json({
      success: true,
      message: "Kiểm tra trạng thái yêu thích thành công",
      data,
    });
  } catch (error) {
    return handleFavoriteError(res, error);
  }
};