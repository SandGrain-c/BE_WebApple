import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

type JwtPayload = {
  userId?: number;
  user_id?: number;
  id?: number;
  role?: string;
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server chưa cấu hình JWT_SECRET",
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const userId = decoded.userId ?? decoded.user_id ?? decoded.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Token không hợp lệ",
      });
    }

    (req as any).user = {
      userId,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }
};