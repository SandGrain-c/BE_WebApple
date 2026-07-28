// src/modules/product-image/product-image.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  createProductImageService,
  deleteProductImageService,
  getProductImagesService,
  ProductImageServiceError,
  setProductImageThumbnailService,
  updateProductImageService,
} from "./product-image.service";
import { createManyProductImagesService } from "./product-image.service";
import { CreateManyProductImagesBody } from "./product-image.dto";
const parseId = (value: unknown) => {
  if (Array.isArray(value)) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
};

const handleProductImageError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof ProductImageServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

export const getProductImagesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const productId = parseId(req.params.productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId không hợp lệ",
      });
    }

    const includeInactive = req.query.includeInactive === "true";
    const color =
      typeof req.query.color === "string" ? req.query.color : undefined;

    const variantId =
      typeof req.query.variantId === "string"
        ? Number(req.query.variantId)
        : null;

    const data = await getProductImagesService(productId, {
      includeInactive,
      color,
      variantId:
        variantId && Number.isInteger(variantId) && variantId > 0
          ? variantId
          : null,
    });

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách ảnh sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleProductImageError(error, res, next);
  }
};

export const createProductImageController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const productId = parseId(req.params.productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId không hợp lệ",
      });
    }

    const data = await createProductImageService(productId, req.body, req.file);

    return res.status(201).json({
      success: true,
      message: "Tạo ảnh sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleProductImageError(error, res, next);
  }
};

export const updateProductImageController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const imageId = parseId(req.params.imageId);

    if (!imageId) {
      return res.status(400).json({
        success: false,
        message: "imageId không hợp lệ",
      });
    }

    const data = await updateProductImageService(imageId, req.body, req.file);

    return res.status(200).json({
      success: true,
      message: "Cập nhật ảnh sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleProductImageError(error, res, next);
  }
};

export const setProductImageThumbnailController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const imageId = parseId(req.params.imageId);

    if (!imageId) {
      return res.status(400).json({
        success: false,
        message: "imageId không hợp lệ",
      });
    }

    const data = await setProductImageThumbnailService(imageId);

    return res.status(200).json({
      success: true,
      message: "Đặt ảnh đại diện sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleProductImageError(error, res, next);
  }
};

export const deleteProductImageController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const imageId = parseId(req.params.imageId);

    if (!imageId) {
      return res.status(400).json({
        success: false,
        message: "imageId không hợp lệ",
      });
    }

    const destroyCloudinary = req.query.destroyCloudinary === "true";

    const data = await deleteProductImageService(imageId, {
      destroyCloudinary,
    });

    return res.status(200).json({
      success: true,
      message: "Xóa ảnh sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleProductImageError(error, res, next);
  }
};

/**
 * createManyProductImagesController:
 * Upload nhiều ảnh sản phẩm cho Admin.
 */
export const createManyProductImagesController = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);

    const files = req.files as Express.Multer.File[];

    const data = await createManyProductImagesService(
      productId,
      files,
      req.body as CreateManyProductImagesBody
    );

    return res.status(201).json({
      success: true,
      message: "Upload nhiều ảnh sản phẩm thành công",
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload nhiều ảnh sản phẩm thất bại";

    return res.status(400).json({
      success: false,
      message,
    });
  }
};