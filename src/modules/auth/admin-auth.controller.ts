import { Request, Response } from "express";

import { AdminLoginBody } from "./admin-auth.dto";
import { loginAdmin } from "./admin-auth.service";

/**
 * adminLoginController:
 * Nhận request login từ Admin FE và trả accessToken.
 */
export const adminLoginController = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body as AdminLoginBody;

    const data = await loginAdmin(identifier, password);

    return res.json({
      success: true,
      message: "Đăng nhập trang quản trị thành công",
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Đăng nhập quản trị thất bại";

    return res.status(400).json({
      success: false,
      message,
    });
  }
};

/**
 * adminMeController:
 * Trả thông tin admin hiện tại từ token.
 */
export const adminMeController = async (req: Request, res: Response) => {
  const user = (req as any).user;

  return res.json({
    success: true,
    message: "Lấy thông tin admin thành công",
    data: {
      user,
    },
  });
};