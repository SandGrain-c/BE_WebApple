// src/modules/auth/auth.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  AuthServiceError,
  forgotPasswordService,
  getMeService,
  loginService,
  registerService,
  resetPasswordService,
} from "./auth.service";
import type {
  ForgotPasswordPayload,
  ResetPasswordPayload,
} from "./auth.dto";

const getUserIdFromRequest = (req: Request): number | null => {
  const user = (req as any).user;

  const userId = user?.userId ?? user?.id ?? user?.user_id;
  const numberUserId = Number(userId);

  if (!Number.isInteger(numberUserId) || numberUserId <= 0) {
    return null;
  }

  return numberUserId;
};

const handleAuthError = (
  error: unknown,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof AuthServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
};

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await registerService(req.body);

    return res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      data,
    });
  } catch (error) {
    return handleAuthError(error, res, next);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await loginService(req.body);

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      data,
    });
  } catch (error) {
    return handleAuthError(error, res, next);
  }
};

export const forgotPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const message = await forgotPasswordService(
      req.body as ForgotPasswordPayload,
    );

    return res.status(200).json({
      success: true,
      message,
    });
  } catch (error) {
    return handleAuthError(error, res, next);
  }
};

export const resetPasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await resetPasswordService(req.body as ResetPasswordPayload);

    return res.status(200).json({
      success: true,
      message: "Mật khẩu đã được đặt lại thành công",
    });
  } catch (error) {
    return handleAuthError(error, res, next);
  }
};

export const getMeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const user = await getMeService(userId);

    return res.status(200).json({
      success: true,
      message: "Lấy thông tin người dùng thành công",
      data: {
        user,
      },
    });
  } catch (error) {
    return handleAuthError(error, res, next);
  }
};

export const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Đăng xuất thành công",
    });
  } catch (error) {
    return next(error);
  }
};
