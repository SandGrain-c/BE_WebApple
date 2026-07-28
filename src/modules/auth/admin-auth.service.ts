import bcrypt from "bcrypt";
// import jwt from "jsonwebtoken";
import jwt, { type SignOptions } from "jsonwebtoken";

import prisma from "../../utils/prisma";
import { AdminLoginResponseDto } from "./admin-auth.dto";

const ADMIN_ALLOWED_ROLES = [
  "Admin",
  "Staff",
  "SaleStaff",
  "WarehouseStaff",
  "AfterSalesStaff",
];

/**
 * loginAdmin:
 * Xử lý đăng nhập cho trang quản trị.
 */
export const loginAdmin = async (
  identifier: string,
  password: string
): Promise<AdminLoginResponseDto> => {
  if (!identifier || !password) {
    throw new Error("Vui lòng nhập tài khoản và mật khẩu");
  }

  const user = await prisma.users.findFirst({
    where: {
      OR: [
        { user_name: identifier },
        { email: identifier },
        { phone: identifier },
      ],
    },
    include: {
      roles: true,
    },
  });

  if (!user) {
    throw new Error("Tài khoản hoặc mật khẩu không đúng");
  }

  if (user.status !== 1) {
    throw new Error("Tài khoản đã bị khóa hoặc ngừng hoạt động");
  }

  const isPasswordValid = await bcrypt.compare(password, user.pass_hash);

  if (!isPasswordValid) {
    throw new Error("Tài khoản hoặc mật khẩu không đúng");
  }

  const roleName = user.roles.role_name;

  // Chặn Customer đăng nhập vào trang quản trị
  if (!ADMIN_ALLOWED_ROLES.includes(roleName)) {
    throw new Error("Tài khoản không có quyền truy cập trang quản trị");
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("Thiếu cấu hình JWT_SECRET");
  }

  // Payload JWT giữ cùng format với authMiddleware hiện tại
const expiresIn: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];

const accessToken = jwt.sign(
  {
    userId: user.user_id,
    role: roleName,
  },
  jwtSecret,
  {
    expiresIn,
  }
);

  return {
    user: {
      id: user.user_id,
      userName: user.user_name,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: roleName,
    },
    accessToken,
  };
};