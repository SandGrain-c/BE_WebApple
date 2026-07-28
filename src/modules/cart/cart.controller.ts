// src/modules/cart/cart.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  addCartItemService,
  CartServiceError,
  clearCartService,
  getCartService,
  removeCartItemService,
  selectAllCartItemsService,
  updateCartItemQuantityService,
  updateCartItemSelectedService,
} from "./cart.service";

const getUserIdFromRequest = (req: Request): number | null => {
  const user = (req as any).user;

  const userId = user?.userId ?? user?.id ?? user?.user_id;

  const numberUserId = Number(userId);

  if (!Number.isInteger(numberUserId) || numberUserId <= 0) {
    return null;
  }

  return numberUserId;
};

const handleCartError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof CartServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

export const getCartController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để xem giỏ hàng",
      });
    }

    const data = await getCartService(userId);

    return res.status(200).json({
      success: true,
      message:
        data.items.length > 0
          ? "Lấy giỏ hàng thành công"
          : "Giỏ hàng đang trống",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};

export const addCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng",
      });
    }

    const data = await addCartItemService(userId, req.body);

    return res.status(201).json({
      success: true,
      message: "Đã thêm sản phẩm vào giỏ hàng",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};

export const updateCartItemQuantityController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const cartItemId = Number(req.params.cartItemId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để cập nhật giỏ hàng",
      });
    }

    if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: "cartItemId không hợp lệ",
      });
    }

    const data = await updateCartItemQuantityService(
      userId,
      cartItemId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật số lượng sản phẩm",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};



export const removeCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const cartItemId = Number(req.params.cartItemId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để xóa sản phẩm khỏi giỏ hàng",
      });
    }

    if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: "cartItemId không hợp lệ",
      });
    }

    const data = await removeCartItemService(userId, cartItemId);

    return res.status(200).json({
      success: true,
      message: "Đã xóa sản phẩm khỏi giỏ hàng",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};

export const clearCartController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để xóa giỏ hàng",
      });
    }

    const data = await clearCartService(userId);

    return res.status(200).json({
      success: true,
      message: "Đã xóa toàn bộ giỏ hàng",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};

export const updateCartItemSelectedController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const cartItemId = Number(req.params.cartItemId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để cập nhật giỏ hàng",
      });
    }

    if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
      return res.status(400).json({
        success: false,
        message: "cartItemId không hợp lệ",
      });
    }

    const data = await updateCartItemSelectedService(
      userId,
      cartItemId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái chọn sản phẩm",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};

export const selectAllCartItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để cập nhật giỏ hàng",
      });
    }

    const data = await selectAllCartItemsService(userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái chọn tất cả sản phẩm",
      data,
    });
  } catch (error) {
    return handleCartError(error, res, next);
  }
};