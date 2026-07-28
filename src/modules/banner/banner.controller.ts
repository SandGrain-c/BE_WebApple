// src/modules/banner/banner.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  BannerServiceError,
  createBannerService,
  deleteBannerService,
  getAdminBannersService,
  getPublicBannersService,
  updateBannerService,
} from "./banner.service";

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

const handleBannerError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof BannerServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

export const getPublicBannersController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const position =
      typeof req.query.position === "string" ? req.query.position : undefined;

    const data = await getPublicBannersService(position);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách banner thành công",
      data,
    });
  } catch (error) {
    return handleBannerError(error, res, next);
  }
};

export const getAdminBannersController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const position =
      typeof req.query.position === "string" ? req.query.position : undefined;

    const isActive =
      typeof req.query.isActive === "string" ? req.query.isActive : undefined;

    const data = await getAdminBannersService({
      position,
      isActive,
    });

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách banner quản trị thành công",
      data,
    });
  } catch (error) {
    return handleBannerError(error, res, next);
  }
};

export const createBannerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await createBannerService(req.body, req.file);

    return res.status(201).json({
      success: true,
      message: "Tạo banner thành công",
      data,
    });
  } catch (error) {
    return handleBannerError(error, res, next);
  }
};

export const updateBannerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const bannerId = parseId(req.params.bannerId);

    if (!bannerId) {
      return res.status(400).json({
        success: false,
        message: "bannerId không hợp lệ",
      });
    }

    const data = await updateBannerService(bannerId, req.body, req.file);

    return res.status(200).json({
      success: true,
      message: "Cập nhật banner thành công",
      data,
    });
  } catch (error) {
    return handleBannerError(error, res, next);
  }
};

export const deleteBannerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const bannerId = parseId(req.params.bannerId);

    if (!bannerId) {
      return res.status(400).json({
        success: false,
        message: "bannerId không hợp lệ",
      });
    }

    const data = await deleteBannerService(bannerId);

    return res.status(200).json({
      success: true,
      message: "Xóa banner thành công",
      data,
    });
  } catch (error) {
    return handleBannerError(error, res, next);
  }
};