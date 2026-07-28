import { Request, Response } from "express";

import {
  AdminUserServiceError,
  createAdminUserService,
  getAdminRolesService,
  getAdminUserDetailService,
  getAdminUsersService,
  resetUserPasswordService,
  updateUserRoleService,
  updateUserStatusService,
} from "./admin-user.service";
import {
  CreateAdminUserBody,
  GetAdminUsersQuery,
  ResetUserPasswordBody,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
} from "./admin-user.dto";

/**
 * Lấy userId admin hiện tại từ authMiddleware.
 */
const getCurrentAdminUserId = (req: Request) => {
  return Number((req as any).user?.userId);
};

/**
 * Xử lý lỗi chung cho Admin User Controller.
 */
const handleAdminUserError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminUserServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý tài khoản thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/users
 */
export const getAdminUsersController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminUsersService(req.query as GetAdminUsersQuery);

    return res.json({
      success: true,
      message: "Lấy danh sách tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * GET /api/admin/users/:userId
 */
export const getAdminUserDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = Number(req.params.userId);
    const data = await getAdminUserDetailService(userId);

    return res.json({
      success: true,
      message: "Lấy chi tiết tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * POST /api/admin/users
 */
export const createAdminUserController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await createAdminUserService(
      req.body as CreateAdminUserBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * PATCH /api/admin/users/:userId/status
 */
export const updateUserStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const targetUserId = Number(req.params.userId);
    const currentAdminUserId = getCurrentAdminUserId(req);

    const data = await updateUserStatusService(
      targetUserId,
      currentAdminUserId,
      req.body as UpdateUserStatusBody
    );

    return res.json({
      success: true,
      message: "Cập nhật trạng thái tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * PATCH /api/admin/users/:userId/role
 */
export const updateUserRoleController = async (
  req: Request,
  res: Response
) => {
  try {
    const targetUserId = Number(req.params.userId);
    const currentAdminUserId = getCurrentAdminUserId(req);

    const data = await updateUserRoleService(
      targetUserId,
      currentAdminUserId,
      req.body as UpdateUserRoleBody
    );

    return res.json({
      success: true,
      message: "Cập nhật role tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * PATCH /api/admin/users/:userId/password
 */
export const resetUserPasswordController = async (
  req: Request,
  res: Response
) => {
  try {
    const targetUserId = Number(req.params.userId);

    const data = await resetUserPasswordService(
      targetUserId,
      req.body as ResetUserPasswordBody
    );

    return res.json({
      success: true,
      message: "Reset mật khẩu thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};

/**
 * GET /api/admin/roles
 */
export const getAdminRolesController = async (
  _req: Request,
  res: Response
) => {
  try {
    const data = await getAdminRolesService();

    return res.json({
      success: true,
      message: "Lấy danh sách role thành công",
      data,
    });
  } catch (error) {
    return handleAdminUserError(res, error);
  }
};