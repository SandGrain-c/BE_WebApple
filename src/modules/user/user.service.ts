// src/modules/user/user.service.ts

import prisma from "../../utils/prisma";
import {
  UpdateUserPasswordBody,
  UpdateUserProfileBody,
  UserProfileDto,
} from "./user.dto";
import { mapUserProfileToDto } from "./user.mapper";
import bcrypt from "bcrypt";
export class UserServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Chuẩn hóa text.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Kiểm tra email cơ bản.
 */
const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Kiểm tra số điện thoại Việt Nam cơ bản.
 * Cho phép 10-11 chữ số.
 */
const isValidPhone = (phone: string) => {
  return /^[0-9]{10,11}$/.test(phone);
};

/**
 * Kiểm tra mật khẩu mới.
 */
const isValidPassword = (password: string) => {
  return password.length >= 6;
};
/**
 * PATCH /api/users/profile
 * User tự cập nhật thông tin cá nhân.
 */
export const updateMyProfileService = async (
  userId: number,
  body: UpdateUserProfileBody
): Promise<UserProfileDto> => {
  if (!userId || Number.isNaN(userId)) {
    throw new UserServiceError("Bạn chưa đăng nhập", 401);
  }

  const fullName = normalizeText(body.fullName);
  const email = normalizeText(body.email);
  const phone = normalizeText(body.phone);

  /**
   * Không cho update rỗng hoàn toàn.
   */
  if (
    body.fullName === undefined &&
    body.email === undefined &&
    body.phone === undefined
  ) {
    throw new UserServiceError("Không có thông tin nào để cập nhật", 400);
  }

  /**
   * Kiểm tra user có tồn tại không.
   */
  const existedUser = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
  });

  if (!existedUser) {
    throw new UserServiceError("Không tìm thấy người dùng", 404);
  }

  /**
   * Nếu FE gửi fullName thì không cho rỗng.
   */
  if (body.fullName !== undefined && !fullName) {
    throw new UserServiceError("Họ tên không được để trống", 400);
  }

  /**
   * Nếu FE gửi email thì validate và kiểm tra trùng.
   */
  if (body.email !== undefined) {
    if (!email) {
      throw new UserServiceError("Email không được để trống", 400);
    }

    if (!isValidEmail(email)) {
      throw new UserServiceError("Email không hợp lệ", 400);
    }

    const duplicatedEmail = await prisma.users.findFirst({
      where: {
        email,
        NOT: {
          user_id: userId,
        },
      },
    });

    if (duplicatedEmail) {
      throw new UserServiceError("Email đã được sử dụng", 409);
    }
  }

  /**
   * Nếu FE gửi phone thì validate và kiểm tra trùng.
   */
  if (body.phone !== undefined) {
    if (!phone) {
      throw new UserServiceError("Số điện thoại không được để trống", 400);
    }

    if (!isValidPhone(phone)) {
      throw new UserServiceError("Số điện thoại không hợp lệ", 400);
    }

    const duplicatedPhone = await prisma.users.findFirst({
      where: {
        phone,
        NOT: {
          user_id: userId,
        },
      },
    });

    if (duplicatedPhone) {
      throw new UserServiceError("Số điện thoại đã được sử dụng", 409);
    }
  }

  const updateData: any = {};

if (body.fullName !== undefined) {
  updateData.full_name = fullName;
}

if (body.email !== undefined) {
  updateData.email = email;
}

if (body.phone !== undefined) {
  updateData.phone = phone;
}

const updatedUser = await prisma.users.update({
  where: {
    user_id: userId,
  },
  data: updateData,
  include: {
    roles: true,
  },
});

return mapUserProfileToDto(updatedUser);
};

/**
 * PATCH /api/users/password
 * User tự đổi mật khẩu.
 *
 * Hash = mã hóa một chiều mật khẩu trước khi lưu DB.
 * bcrypt = thư viện dùng để hash và kiểm tra mật khẩu.
 */
export const updateMyPasswordService = async (
  userId: number,
  body: UpdateUserPasswordBody
): Promise<void> => {
  if (!userId || Number.isNaN(userId)) {
    throw new UserServiceError("Bạn chưa đăng nhập", 401);
  }

  const currentPassword = body.currentPassword?.trim();
  const newPassword = body.newPassword?.trim();
  const confirmPassword = body.confirmPassword?.trim();

  if (!currentPassword) {
    throw new UserServiceError("Vui lòng nhập mật khẩu hiện tại", 400);
  }

  if (!newPassword) {
    throw new UserServiceError("Vui lòng nhập mật khẩu mới", 400);
  }

  if (!confirmPassword) {
    throw new UserServiceError("Vui lòng xác nhận mật khẩu mới", 400);
  }

  if (!isValidPassword(newPassword)) {
    throw new UserServiceError("Mật khẩu mới phải có ít nhất 6 ký tự", 400);
  }

  if (newPassword !== confirmPassword) {
    throw new UserServiceError("Xác nhận mật khẩu mới không khớp", 400);
  }

  if (currentPassword === newPassword) {
    throw new UserServiceError(
      "Mật khẩu mới không được trùng mật khẩu hiện tại",
      400
    );
  }

  const user = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    select: {
      user_id: true,
      pass_hash: true,
    },
  });

  if (!user) {
    throw new UserServiceError("Không tìm thấy người dùng", 404);
  }

  const isCurrentPasswordCorrect = await bcrypt.compare(
    currentPassword,
    user.pass_hash
  );

  if (!isCurrentPasswordCorrect) {
    throw new UserServiceError("Mật khẩu hiện tại không chính xác", 400);
  }

  const saltRounds = 10;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  await prisma.users.update({
    where: {
      user_id: userId,
    },
    data: {
      pass_hash: newPasswordHash,
    },
  });
};