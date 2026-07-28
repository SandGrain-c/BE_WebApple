// src/modules/admin-product/admin-product.controller.ts
import { Request, Response } from "express";

import {
  AdminProductServiceError,
  createAdminProductService,
  deleteAdminProductService,
  getAdminProductDetailService,
  getAdminProductsService,
  updateAdminProductService,
} from "./admin-product.service";
import {
  CreateAdminProductBody,
  GetAdminProductsQuery,
  UpdateAdminProductBody,
} from "./admin-product.dto";

/**
 * GET /api/admin/products
 */
export const getAdminProductsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminProductsService(
      req.query as GetAdminProductsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách sản phẩm admin thành công",
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof AdminProductServiceError ? error.statusCode : 500;

    const message =
      error instanceof Error
        ? error.message
        : "Lấy danh sách sản phẩm admin thất bại";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/admin/products/:productId
 */
export const getAdminProductDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);
    const data = await getAdminProductDetailService(productId);

    return res.json({
      success: true,
      message: "Lấy chi tiết sản phẩm admin thành công",
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof AdminProductServiceError ? error.statusCode : 500;

    const message =
      error instanceof Error
        ? error.message
        : "Lấy chi tiết sản phẩm admin thất bại";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * POST /api/admin/products
 */
export const createAdminProductController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await createAdminProductService(
      req.body as CreateAdminProductBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo sản phẩm thành công",
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof AdminProductServiceError ? error.statusCode : 500;

    const message =
      error instanceof Error ? error.message : "Tạo sản phẩm thất bại";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * PATCH /api/admin/products/:productId
 */
export const updateAdminProductController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);

    const data = await updateAdminProductService(
      productId,
      req.body as UpdateAdminProductBody
    );

    return res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof AdminProductServiceError ? error.statusCode : 500;

    const message =
      error instanceof Error ? error.message : "Cập nhật sản phẩm thất bại";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * DELETE /api/admin/products/:productId
 */
export const deleteAdminProductController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);
    const data = await deleteAdminProductService(productId);

    return res.json({
      success: true,
      message: "Xóa mềm sản phẩm thành công",
      data,
    });
  } catch (error) {
    const statusCode =
      error instanceof AdminProductServiceError ? error.statusCode : 500;

    const message =
      error instanceof Error ? error.message : "Xóa sản phẩm thất bại";

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};