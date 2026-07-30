import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import prisma from "../utils/prisma";

type JwtPayload = {
  userId?: number;
  user_id?: number;
  id?: number;
};

const unauthorized = (res: Response, message: string) => {
  return res.status(401).json({
    success: false,
    message,
  });
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized(res, "Bạn chưa đăng nhập");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return unauthorized(res, "Token không hợp lệ");
  }

  if (!env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "Server chưa cấu hình JWT_SECRET",
    });
  }

  let decoded: JwtPayload;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return unauthorized(res, "Token không hợp lệ hoặc đã hết hạn");
  }

  const rawUserId = decoded.userId ?? decoded.user_id ?? decoded.id;
  const userId = Number(rawUserId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return unauthorized(res, "Token không hợp lệ");
  }

  try {
    const currentUser = await prisma.users.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        user_id: true,
        status: true,
        roles: {
          select: {
            role_name: true,
          },
        },
      },
    });

    if (!currentUser || currentUser.status !== 1) {
      return unauthorized(res, "Tài khoản không tồn tại hoặc đã bị khóa");
    }

    req.user = {
      userId: currentUser.user_id,
      role: currentUser.roles.role_name,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
