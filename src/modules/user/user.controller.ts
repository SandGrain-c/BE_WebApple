// src/modules/user/user.controller.ts

import type { Request, Response } from "express";
import {
  updateMyPasswordService,
  updateMyProfileService,
} from "./user.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

function getStatusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? Number((error as any).statusCode)
    : 500;
}

/**
 * Lấy userId từ authMiddleware.
 */
function getUserId(req: Request) {
  return (req as any).user?.userId as number | undefined;
}

/**
 * PATCH /api/users/profile
 * Cập nhật hồ sơ cá nhân của user đang đăng nhập.
 */
export async function updateMyProfileController(req: Request, res: Response) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const data = await updateMyProfileService(userId, req.body);

    return res.json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công",
      data: {
        user: data,
      },
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

/**
 * PATCH /api/users/password
 * Đổi mật khẩu user đang đăng nhập.
 */
export async function updateMyPasswordController(req: Request, res: Response) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    await updateMyPasswordService(userId, req.body);

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    return res.status(getStatusCode(error)).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}