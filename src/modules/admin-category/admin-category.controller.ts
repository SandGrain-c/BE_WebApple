// src/modules/admin-category/admin-category.controller.ts

import { Request, Response } from "express";

import {
  AdminCategoryServiceError,
  createAdminCategoryService,
  deleteAdminCategoryService,
  getAdminCategoriesService,
  getAdminCategoryDetailService,
  updateAdminCategoryService,
} from "./admin-category.service";
import {
  CreateAdminCategoryBody,
  GetAdminCategoriesQuery,
  UpdateAdminCategoryBody,
} from "./admin-category.dto";

/**
 * Xử lý lỗi chung cho Admin Category Controller.
 */
const handleAdminCategoryError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminCategoryServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý danh mục thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/categories
 */
export const getAdminCategoriesController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminCategoriesService(
      req.query as GetAdminCategoriesQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách danh mục admin thành công",
      data,
    });
  } catch (error) {
    return handleAdminCategoryError(res, error);
  }
};

/**
 * GET /api/admin/categories/:categoryId
 */
export const getAdminCategoryDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const data = await getAdminCategoryDetailService(categoryId);

    return res.json({
      success: true,
      message: "Lấy chi tiết danh mục thành công",
      data,
    });
  } catch (error) {
    return handleAdminCategoryError(res, error);
  }
};

/**
 * POST /api/admin/categories
 */
export const createAdminCategoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await createAdminCategoryService(
      req.body as CreateAdminCategoryBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo danh mục thành công",
      data,
    });
  } catch (error) {
    return handleAdminCategoryError(res, error);
  }
};

/**
 * PATCH /api/admin/categories/:categoryId
 */
export const updateAdminCategoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const categoryId = Number(req.params.categoryId);

    const data = await updateAdminCategoryService(
      categoryId,
      req.body as UpdateAdminCategoryBody
    );

    return res.json({
      success: true,
      message: "Cập nhật danh mục thành công",
      data,
    });
  } catch (error) {
    return handleAdminCategoryError(res, error);
  }
};

/**
 * DELETE /api/admin/categories/:categoryId
 */
export const deleteAdminCategoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const data = await deleteAdminCategoryService(categoryId);

    return res.json({
      success: true,
      message: "Xóa mềm danh mục thành công",
      data,
    });
  } catch (error) {
    return handleAdminCategoryError(res, error);
  }
};