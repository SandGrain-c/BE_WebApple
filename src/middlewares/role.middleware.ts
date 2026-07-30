import { NextFunction, Request, Response } from "express";

export const requireRoles = (allowedRoles: readonly string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    if (!user.role) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa có quyền truy cập",
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện chức năng này",
      });
    }

    return next();
  };
};
