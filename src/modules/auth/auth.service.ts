// src/modules/auth/auth.service.ts

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../utils/prisma";
import { env } from "../../config/env";
import { mailService } from "../../services/mail.service";
import { hashPassword, isValidPassword } from "../../utils/password";
import type {
  AuthResponseDto,
  AuthUserDto,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
} from "./auth.dto";

export const FORGOT_PASSWORD_PUBLIC_MESSAGE =
  "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.";
export const PASSWORD_RESET_TOKEN_TYPE = "PASSWORD_RESET";

const INVALID_RESET_TOKEN_MESSAGE = "Token không hợp lệ hoặc đã hết hạn";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export const hashPasswordResetToken = (rawToken: string) => {
  return createHash("sha256").update(rawToken).digest("hex");
};

const buildPasswordResetUrl = (rawToken: string) => {
  const resetUrl = new URL("/reset-password", env.CLIENT_URL);
  resetUrl.searchParams.set("token", rawToken);
  return resetUrl.toString();
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

  if (!password || !isValidPassword(password)) {
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

  const passwordHash = await hashPassword(password);

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

export const forgotPasswordService = async (
  payload: ForgotPasswordPayload,
): Promise<string> => {
  const email = normalizeText(payload?.email)?.toLowerCase() ?? null;

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new AuthServiceError("Email không hợp lệ", 400);
  }

  const customer = await prisma.users.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      status: 1,
      roles: {
        role_name: {
          equals: "Customer",
          mode: "insensitive",
        },
      },
    },
    select: {
      user_id: true,
      email: true,
    },
  });

  if (!customer?.email) {
    return FORGOT_PASSWORD_PUBLIC_MESSAGE;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(rawToken);
  const now = new Date();
  const expiredAt = new Date(
    now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );

  const createdToken = await prisma.$transaction(async (tx) => {
    const lockedUsers = await tx.$queryRaw<Array<{ user_id: number }>>`
      SELECT user_id
      FROM users
      WHERE user_id = ${customer.user_id}
      FOR UPDATE
    `;

    if (lockedUsers.length !== 1) {
      return null;
    }

    const currentCustomer = await tx.users.findUnique({
      where: {
        user_id: customer.user_id,
      },
      include: {
        roles: {
          select: {
            role_name: true,
          },
        },
      },
    });

    if (
      !currentCustomer ||
      currentCustomer.status !== 1 ||
      currentCustomer.roles.role_name.toLowerCase() !== "customer"
    ) {
      return null;
    }

    await tx.verification_tokens.updateMany({
      where: {
        user_id: customer.user_id,
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        used_at: null,
      },
      data: {
        used_at: now,
      },
    });

    return tx.verification_tokens.create({
      data: {
        user_id: customer.user_id,
        token: tokenHash,
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        expired_at: expiredAt,
      },
      select: {
        token_id: true,
      },
    });
  });

  if (!createdToken) {
    return FORGOT_PASSWORD_PUBLIC_MESSAGE;
  }

  try {
    await mailService.sendPasswordResetEmail({
      recipient: customer.email,
      resetUrl: buildPasswordResetUrl(rawToken),
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    });
  } catch {
    await prisma.verification_tokens.deleteMany({
      where: {
        token_id: createdToken.token_id,
        token: tokenHash,
        used_at: null,
      },
    });

    console.error("[auth] password reset email delivery failed");
  }

  return FORGOT_PASSWORD_PUBLIC_MESSAGE;
};

export const resetPasswordService = async (
  payload: ResetPasswordPayload,
): Promise<void> => {
  const rawToken = payload?.token?.trim();
  const newPassword = payload?.newPassword?.trim();
  const confirmPassword = payload?.confirmPassword?.trim();

  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    throw new AuthServiceError(INVALID_RESET_TOKEN_MESSAGE, 400);
  }

  if (!newPassword || !isValidPassword(newPassword)) {
    throw new AuthServiceError("Mật khẩu mới phải có ít nhất 6 ký tự", 400);
  }

  if (!confirmPassword || newPassword !== confirmPassword) {
    throw new AuthServiceError("Xác nhận mật khẩu mới không khớp", 400);
  }

  const tokenHash = hashPasswordResetToken(rawToken);
  const now = new Date();
  const resetToken = await prisma.verification_tokens.findFirst({
    where: {
      token: tokenHash,
      token_type: PASSWORD_RESET_TOKEN_TYPE,
      used_at: null,
      expired_at: {
        gt: now,
      },
    },
    orderBy: {
      created_at: "desc",
    },
    include: {
      users: {
        include: {
          roles: {
            select: {
              role_name: true,
            },
          },
        },
      },
    },
  });

  if (
    !resetToken ||
    resetToken.users.status !== 1 ||
    resetToken.users.roles.role_name.toLowerCase() !== "customer"
  ) {
    throw new AuthServiceError(INVALID_RESET_TOKEN_MESSAGE, 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const consumedToken = await tx.verification_tokens.updateMany({
      where: {
        token_id: resetToken.token_id,
        token: tokenHash,
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        used_at: null,
        expired_at: {
          gt: new Date(),
        },
      },
      data: {
        used_at: new Date(),
      },
    });

    if (consumedToken.count !== 1) {
      throw new AuthServiceError(INVALID_RESET_TOKEN_MESSAGE, 400);
    }

    const currentCustomer = await tx.users.findUnique({
      where: {
        user_id: resetToken.user_id,
      },
      include: {
        roles: {
          select: {
            role_name: true,
          },
        },
      },
    });

    if (
      !currentCustomer ||
      currentCustomer.status !== 1 ||
      currentCustomer.roles.role_name.toLowerCase() !== "customer"
    ) {
      throw new AuthServiceError(INVALID_RESET_TOKEN_MESSAGE, 400);
    }

    const updatedUser = await tx.users.updateMany({
      where: {
        user_id: currentCustomer.user_id,
        status: 1,
        role_id: currentCustomer.role_id,
      },
      data: {
        pass_hash: passwordHash,
      },
    });

    if (updatedUser.count !== 1) {
      throw new AuthServiceError(INVALID_RESET_TOKEN_MESSAGE, 400);
    }
  });
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
