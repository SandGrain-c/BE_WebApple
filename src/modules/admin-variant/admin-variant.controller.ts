// src/modules/admin-variant/admin-variant.controller.ts

import { Request, Response } from "express";

import {
  AdminVariantServiceError,
  createAdminVariantService,
  deleteAdminVariantService,
  getAdminVariantDetailService,
  getAdminVariantsByProductService,
  updateAdminVariantService,
} from "./admin-variant.service";
import {
  CreateAdminVariantBody,
  UpdateAdminVariantBody,
} from "./admin-variant.dto";

/**
 * Xử lý lỗi chung cho Admin Variant Controller.
 */
const handleAdminVariantError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminVariantServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý biến thể sản phẩm thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/products/:productId/variants
 */
export const getAdminVariantsByProductController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);
    const data = await getAdminVariantsByProductService(productId);

    return res.json({
      success: true,
      message: "Lấy danh sách biến thể sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminVariantError(res, error);
  }
};

/**
 * GET /api/admin/variants/:variantId
 */
export const getAdminVariantDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const variantId = Number(req.params.variantId);
    const data = await getAdminVariantDetailService(variantId);

    return res.json({
      success: true,
      message: "Lấy chi tiết biến thể sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminVariantError(res, error);
  }
};

/**
 * POST /api/admin/products/:productId/variants
 */
export const createAdminVariantController = async (
  req: Request,
  res: Response
) => {
  try {
    const productId = Number(req.params.productId);

    const data = await createAdminVariantService(
      productId,
      req.body as CreateAdminVariantBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo biến thể sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminVariantError(res, error);
  }
};

/**
 * PATCH /api/admin/variants/:variantId
 */
export const updateAdminVariantController = async (
  req: Request,
  res: Response
) => {
  try {
    const variantId = Number(req.params.variantId);

    const data = await updateAdminVariantService(
      variantId,
      req.body as UpdateAdminVariantBody
    );

    return res.json({
      success: true,
      message: "Cập nhật biến thể sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminVariantError(res, error);
  }
};

/**
 * DELETE /api/admin/variants/:variantId
 */
export const deleteAdminVariantController = async (
  req: Request,
  res: Response
) => {
  try {
    const variantId = Number(req.params.variantId);
    const data = await deleteAdminVariantService(variantId);

    return res.json({
      success: true,
      message: "Xóa biến thể sản phẩm thành công",
      data,
    });
  } catch (error) {
    return handleAdminVariantError(res, error);
  }
};