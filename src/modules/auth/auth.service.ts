// src/modules/auth/auth.service.ts

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../utils/prisma";
import { env } from "../../config/env";
import type {
  AuthResponseDto,
  AuthUserDto,
  LoginPayload,
  RegisterPayload,
} from "./auth.dto";

export class AuthServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

type UserWithRole = {
  user_id: number;
  user_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  roles: {
    role_name: string;
  };
};

const mapUserToDto = (user: UserWithRole): AuthUserDto => {
  return {
    id: user.user_id,
    userName: user.user_name,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.roles.role_name,
  };
};

const signAccessToken = (payload: { userId: number; role: string }) => {
  if (!env.JWT_SECRET) {
    throw new AuthServiceError("Server chưa cấu hình JWT_SECRET", 500);
  }

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const validateRegisterPayload = (payload: RegisterPayload) => {
  const userName = normalizeText(payload.userName);
  const fullName = normalizeText(payload.fullName);
  const email = normalizeText(payload.email)?.toLowerCase() ?? null;
  const phone = normalizeText(payload.phone);
  const password = payload.password;

  if (!userName) {
    throw new AuthServiceError("Vui lòng nhập tên đăng nhập", 400);
  }

  if (userName.length < 3 || userName.length > 25) {
    throw new AuthServiceError("Tên đăng nhập phải từ 3 đến 25 ký tự", 400);
  }

  if (!fullName) {
    throw new AuthServiceError("Vui lòng nhập họ tên", 400);
  }

  if (!email && !phone) {
    throw new AuthServiceError("Vui lòng nhập email hoặc số điện thoại", 400);
  }

  if (!password || password.length < 6) {
    throw new AuthServiceError("Mật khẩu phải có ít nhất 6 ký tự", 400);
  }

  return {
    userName,
    fullName,
    email,
    phone,
    password,
  };
};

export const registerService = async (
  payload: RegisterPayload,
): Promise<AuthResponseDto> => {
  const { userName, fullName, email, phone, password } =
    validateRegisterPayload(payload);

  const duplicateConditions: Array<
    | { user_name: string }
    | { email: string }
    | { phone: string }
  > = [{ user_name: userName }];

  if (email) {
    duplicateConditions.push({ email });
  }

  if (phone) {
    duplicateConditions.push({ phone });
  }

  const existedUser = await prisma.users.findFirst({
    where: {
      OR: duplicateConditions,
    },
  });

  if (existedUser) {
    if (existedUser.user_name === userName) {
      throw new AuthServiceError("Tên đăng nhập đã tồn tại", 409);
    }

    if (email && existedUser.email === email) {
      throw new AuthServiceError("Email đã được sử dụng", 409);
    }

    if (phone && existedUser.phone === phone) {
      throw new AuthServiceError("Số điện thoại đã được sử dụng", 409);
    }

    throw new AuthServiceError("Tài khoản đã tồn tại", 409);
  }

  const customerRole = await prisma.roles.findFirst({
    where: {
      role_name: {
        equals: "Customer",
        mode: "insensitive",
      },
    },
  });

  if (!customerRole) {
    throw new AuthServiceError("Chưa cấu hình role Customer", 500);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const createdUser = await prisma.users.create({
    data: {
      role_id: customerRole.role_id,
      user_name: userName,
      full_name: fullName,
      email,
      phone,
      pass_hash: passwordHash,
      status: 1,
    },
    include: {
      roles: {
        select: {
          role_name: true,
        },
      },
    },
  });

  const userDto = mapUserToDto(createdUser);

  const accessToken = signAccessToken({
    userId: userDto.id,
    role: userDto.role,
  });

  return {
    user: userDto,
    accessToken,
  };
};

export const loginService = async (
  payload: LoginPayload,
): Promise<AuthResponseDto> => {
  const identifier = payload.identifier?.trim();
  const password = payload.password;

  if (!identifier || !password) {
    throw new AuthServiceError("Vui lòng nhập tài khoản và mật khẩu", 400);
  }

  const user = await prisma.users.findFirst({
    where: {
      OR: [
        {
          email: identifier.toLowerCase(),
        },
        {
          phone: identifier,
        },
        {
          user_name: identifier,
        },
      ],
    },
    include: {
      roles: {
        select: {
          role_name: true,
        },
      },
    },
  });

  if (!user) {
    throw new AuthServiceError("Tài khoản hoặc mật khẩu không đúng", 401);
  }

  if (user.status !== 1) {
    throw new AuthServiceError("Tài khoản đã bị khóa hoặc ngừng hoạt động", 403);
  }

  const isPasswordValid = await bcrypt.compare(password, user.pass_hash);

  if (!isPasswordValid) {
    throw new AuthServiceError("Tài khoản hoặc mật khẩu không đúng", 401);
  }

  const userDto = mapUserToDto(user);

  const accessToken = signAccessToken({
    userId: userDto.id,
    role: userDto.role,
  });

  return {
    user: userDto,
    accessToken,
  };
};

export const getMeService = async (userId: number): Promise<AuthUserDto> => {
  const user = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    include: {
      roles: {
        select: {
          role_name: true,
        },
      },
    },
  });

  if (!user) {
    throw new AuthServiceError("Không tìm thấy người dùng", 404);
  }

  if (user.status !== 1) {
    throw new AuthServiceError("Tài khoản đã bị khóa hoặc ngừng hoạt động", 403);
  }

  return mapUserToDto(user);
};