import { NextFunction, Request, Response } from "express";

import { AdminLoginBody } from "./admin-auth.dto";
import {
  AdminAuthError,
  getCurrentAdminUser,
  loginAdmin,
} from "./admin-auth.service";

const handleAdminAuthError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof AdminAuthError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

/**
 * adminLoginController:
 * Nhận request login từ Admin FE và trả accessToken.
 */
export const adminLoginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { identifier, password } = req.body as AdminLoginBody;

    const data = await loginAdmin(identifier, password);

    return res.json({
      success: true,
      message: "Đăng nhập trang quản trị thành công",
      data,
    });
  } catch (error) {
    return handleAdminAuthError(error, res, next);
  }
};

/**
 * adminMeController:
 * Trả thông tin admin hiện tại từ token.
 */
export const adminMeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const user = await getCurrentAdminUser(req.user.userId);

    return res.json({
      success: true,
      message: "Lấy thông tin admin thành công",
      data: {
        user,
      },
    });
  } catch (error) {
    return handleAdminAuthError(error, res, next);
  }
};
