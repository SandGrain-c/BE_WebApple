// src/modules/admin-staff/admin-staff.controller.ts

import type { Request, Response, NextFunction } from "express";
import {
  AdminStaffServiceError,
  createAdminStaffService,
  getAdminStaffDetailService,
  getAdminStaffListService,
  getAdminStaffRolesService,
  resetAdminStaffPasswordService,
  updateAdminStaffRoleService,
  updateAdminStaffService,
  updateAdminStaffStatusService,
} from "./admin-staff.service";

const getActorIdFromRequest = (req: Request): number => {
  const user = (req as any).user;
  const actorId = Number(user?.userId ?? user?.id ?? user?.user_id);

  return Number.isInteger(actorId) && actorId > 0 ? actorId : 0;
};

const parseUserId = (req: Request): number | null => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
};

const handleAdminStaffError = (
  error: unknown,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof AdminStaffServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

export const getAdminStaffRolesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getAdminStaffRolesService();

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách role và quyền thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const getAdminStaffListController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = await getAdminStaffListService(req.query);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const getAdminStaffDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = parseUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    const data = await getAdminStaffDetailService(userId);

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const createAdminStaffController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const actorId = getActorIdFromRequest(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const data = await createAdminStaffService(actorId, req.body);

    return res.status(201).json({
      success: true,
      message: "Tạo tài khoản nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const updateAdminStaffController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const actorId = getActorIdFromRequest(req);
    const userId = parseUserId(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    const data = await updateAdminStaffService(actorId, userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Cập nhật nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const updateAdminStaffStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const actorId = getActorIdFromRequest(req);
    const userId = parseUserId(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    const data = await updateAdminStaffStatusService(actorId, userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái tài khoản nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const updateAdminStaffRoleController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const actorId = getActorIdFromRequest(req);
    const userId = parseUserId(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    const data = await updateAdminStaffRoleService(actorId, userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Cập nhật role nhân viên thành công",
      data,
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};

export const resetAdminStaffPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const actorId = getActorIdFromRequest(req);
    const userId = parseUserId(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    await resetAdminStaffPasswordService(actorId, userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Reset mật khẩu nhân viên thành công",
    });
  } catch (error) {
    return handleAdminStaffError(error, res, next);
  }
};
