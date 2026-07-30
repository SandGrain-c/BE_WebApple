// src/modules/user-address/user-address.controller.ts
import { Request, Response } from "express";

import {
  createMyAddressService,
  deleteMyAddressService,
  getMyAddressDetailService,
  getMyAddressesService,
  setDefaultMyAddressService,
  updateMyAddressService,
  UserAddressServiceError,
} from "./user-address.service";
import {
  CreateUserAddressBody,
  UpdateUserAddressBody,
} from "./user-address.dto";

/**
 * Lấy userId từ authMiddleware.
 */
const getUserIdFromRequest = (req: Request) => {
  return Number((req as any).user?.userId);
};

/**
 * Xử lý lỗi chung cho User Address Controller.
 */
const handleUserAddressError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof UserAddressServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý địa chỉ thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/user/addresses
 */
export const getMyAddressesController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await getMyAddressesService(userId);

    return res.json({
      success: true,
      message: "Lấy danh sách địa chỉ thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};

/**
 * GET /api/user/addresses/:addressId
 */
export const getMyAddressDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const addressId = Number(req.params.addressId);

    const data = await getMyAddressDetailService(userId, addressId);

    return res.json({
      success: true,
      message: "Lấy chi tiết địa chỉ thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};

/**
 * POST /api/user/addresses
 */
export const createMyAddressController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);

    const data = await createMyAddressService(
      userId,
      req.body as CreateUserAddressBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo địa chỉ thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};

/**
 * PATCH /api/user/addresses/:addressId
 */
export const updateMyAddressController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const addressId = Number(req.params.addressId);

    const data = await updateMyAddressService(
      userId,
      addressId,
      req.body as UpdateUserAddressBody
    );

    return res.json({
      success: true,
      message: "Cập nhật địa chỉ thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};

/**
 * PATCH /api/user/addresses/:addressId/default
 */
export const setDefaultMyAddressController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const addressId = Number(req.params.addressId);

    const data = await setDefaultMyAddressService(userId, addressId);

    return res.json({
      success: true,
      message: "Đặt địa chỉ mặc định thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};

/**
 * DELETE /api/user/addresses/:addressId
 */
export const deleteMyAddressController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const addressId = Number(req.params.addressId);

    const data = await deleteMyAddressService(userId, addressId);

    return res.json({
      success: true,
      message: "Xóa địa chỉ thành công",
      data,
    });
  } catch (error) {
    return handleUserAddressError(res, error);
  }
};