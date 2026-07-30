// src/modules/admin-product-item/admin-product-item.controller.ts

import type { Request, Response, NextFunction } from "express";
import {
  AdminProductItemServiceError,
  createAdminProductItemService,
  deleteAdminProductItemService,
  getAdminProductItemDetailService,
  getAdminProductItemsService,
  updateAdminProductItemService,
} from "./admin-product-item.service";

const handleAdminProductItemError = (
  error: unknown,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof AdminProductItemServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Xử lý serial sản phẩm thất bại",
  });
};

const parseProductItemId = (req: Request) => {
  const productItemId = Number(req.params.productItemId);

  if (!Number.isInteger(productItemId) || productItemId <= 0) {
    return null;
  }

  return productItemId;
};

export const getAdminProductItemsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getAdminProductItemsService(req.query);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách serial/IMEI sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminProductItemError(error, res, next);
  }
};

export const getAdminProductItemDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const productItemId = parseProductItemId(req);

    if (!productItemId) {
      return res.status(400).json({
        success: false,
        message: "productItemId không hợp lệ",
      });
    }

    const data = await getAdminProductItemDetailService(productItemId);

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết serial/IMEI sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminProductItemError(error, res, next);
  }
};

export const createAdminProductItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await createAdminProductItemService(req.body);

    return res.status(201).json({
      success: true,
      message: "Tạo serial/IMEI sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminProductItemError(error, res, next);
  }
};

export const updateAdminProductItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const productItemId = parseProductItemId(req);

    if (!productItemId) {
      return res.status(400).json({
        success: false,
        message: "productItemId không hợp lệ",
      });
    }

    const data = await updateAdminProductItemService(
      productItemId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật serial/IMEI sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminProductItemError(error, res, next);
  }
};

export const deleteAdminProductItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const productItemId = parseProductItemId(req);

    if (!productItemId) {
      return res.status(400).json({
        success: false,
        message: "productItemId không hợp lệ",
      });
    }

    const data = await deleteAdminProductItemService(productItemId);

    return res.status(200).json({
      success: true,
      message: "Đã chuyển serial/IMEI sản phẩm sang trạng thái ngừng sử dụng",
      data,
    });
  } catch (error) {
    return handleAdminProductItemError(error, res, next);
  }
};
