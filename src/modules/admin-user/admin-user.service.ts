import bcrypt from "bcrypt";

import prisma from "../../utils/prisma";
import {
  AdminRoleDto,
  AdminUserDto,
  AdminUserListResponseDto,
  CreateAdminUserBody,
  GetAdminUsersQuery,
  ResetUserPasswordBody,
  UpdateUserRoleBody,
  UpdateUserStatusBody,
} from "./admin-user.dto";
import { mapAdminUserToDto, mapRoleToDto } from "./admin-user.mapper";

export class AdminUserServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const userInclude = {
  roles: {
    select: {
      role_id: true,
      role_name: true,
    },
  },
};

/**
 * Chuẩn hóa text: bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Chuẩn hóa username.
 */
const normalizeUserName = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Chuẩn hóa email.
 */
const normalizeEmail = (value?: string | null) => {
  const text = value?.trim().toLowerCase();
  return text ? text : null;
};

/**
 * Chuẩn hóa phone.
 */
const normalizePhone = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Kiểm tra status hợp lệ.
 */
const validateStatus = (status: number) => {
  if (![0, 1].includes(status)) {
    throw new AdminUserServiceError("Trạng thái tài khoản không hợp lệ", 400);
  }
};

/**
 * Kiểm tra mật khẩu.
 */
const validatePassword = (password?: string) => {
  const text = password?.trim();

  if (!text || text.length < 6) {
    throw new AdminUserServiceError("Mật khẩu phải có ít nhất 6 ký tự", 400);
  }

  return text;
};

/**
 * Tìm role theo roleId hoặc roleName.
 */
const findRole = async (params: { roleId?: number; roleName?: string }) => {
  if (params.roleId) {
    const role = await prisma.roles.findUnique({
      where: {
        role_id: params.roleId,
      },
    });

    if (!role) {
      throw new AdminUserServiceError("Không tìm thấy role", 404);
    }

    return role;
  }

  if (params.roleName) {
    const role = await prisma.roles.findFirst({
      where: {
        role_name: params.roleName,
      },
    });

    if (!role) {
      throw new AdminUserServiceError("Không tìm thấy role", 404);
    }

    return role;
  }

  /**
   * Nếu không gửi role, mặc định tạo Customer.
   */
  const customerRole = await prisma.roles.findFirst({
    where: {
      role_name: "Customer",
    },
  });

  if (!customerRole) {
    throw new AdminUserServiceError("Không tìm thấy role Customer", 404);
  }

  return customerRole;
};

/**
 * Kiểm tra username/email/phone không bị trùng.
 */
const ensureUserUnique = async (params: {
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
  userId?: number;
}) => {
  if (params.userName) {
    const existedUserName = await prisma.users.findFirst({
      where: {
        user_name: params.userName,
        ...(params.userId
          ? {
              NOT: {
                user_id: params.userId,
              },
            }
          : {}),
      },
      select: {
        user_id: true,
      },
    });

    if (existedUserName) {
      throw new AdminUserServiceError("Tên đăng nhập đã tồn tại", 409);
    }
  }

  if (params.email) {
    const existedEmail = await prisma.users.findFirst({
      where: {
        email: params.email,
        ...(params.userId
          ? {
              NOT: {
                user_id: params.userId,
              },
            }
          : {}),
      },
      select: {
        user_id: true,
      },
    });

    if (existedEmail) {
      throw new AdminUserServiceError("Email đã tồn tại", 409);
    }
  }

  if (params.phone) {
    const existedPhone = await prisma.users.findFirst({
      where: {
        phone: params.phone,
        ...(params.userId
          ? {
              NOT: {
                user_id: params.userId,
              },
            }
          : {}),
      },
      select: {
        user_id: true,
      },
    });

    if (existedPhone) {
      throw new AdminUserServiceError("Số điện thoại đã tồn tại", 409);
    }
  }
};

/**
 * GET /api/admin/users
 * Lấy danh sách user cho Admin.
 */
export const getAdminUsersService = async (
  query: GetAdminUsersQuery
): Promise<AdminUserListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);
  const roleId = query.roleId ? Number(query.roleId) : undefined;
  const roleName = normalizeText(query.roleName);
  const status =
    query.status !== undefined && query.status !== ""
      ? Number(query.status)
      : undefined;

  const where: any = {};

  if (search) {
    where.OR = [
      {
        user_name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        full_name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (roleId !== undefined) {
    if (Number.isNaN(roleId)) {
      throw new AdminUserServiceError("roleId không hợp lệ", 400);
    }

    where.role_id = roleId;
  }

  if (roleName) {
    where.roles = {
      role_name: roleName,
    };
  }

  if (status !== undefined) {
    if (Number.isNaN(status)) {
      throw new AdminUserServiceError("status không hợp lệ", 400);
    }

    validateStatus(status);
    where.status = status;
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "name_asc":
      orderBy = { full_name: "asc" };
      break;
    case "name_desc":
      orderBy = { full_name: "desc" };
      break;
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [items, totalItems] = await Promise.all([
    prisma.users.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: userInclude,
    }),

    prisma.users.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminUserToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/users/:userId
 * Lấy chi tiết user.
 */
export const getAdminUserDetailService = async (
  userId: number
): Promise<AdminUserDto> => {
  if (!userId || Number.isNaN(userId)) {
    throw new AdminUserServiceError("userId không hợp lệ", 400);
  }

  const user = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    include: userInclude,
  });

  if (!user) {
    throw new AdminUserServiceError("Không tìm thấy tài khoản", 404);
  }

  return mapAdminUserToDto(user);
};

/**
 * POST /api/admin/users
 * Admin tạo tài khoản mới.
 */
export const createAdminUserService = async (
  body: CreateAdminUserBody
): Promise<AdminUserDto> => {
  const userName = normalizeUserName(body.userName);
  const fullName = normalizeText(body.fullName);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const password = validatePassword(body.password);

  if (!userName) {
    throw new AdminUserServiceError("Vui lòng nhập tên đăng nhập", 400);
  }

  if (!fullName) {
    throw new AdminUserServiceError("Vui lòng nhập họ tên", 400);
  }

  await ensureUserUnique({
    userName,
    email,
    phone,
  });

  const role = await findRole({
    roleId: body.roleId,
    roleName: body.roleName,
  });

  const status = body.status === undefined ? 1 : Number(body.status);

  if (Number.isNaN(status)) {
    throw new AdminUserServiceError("status không hợp lệ", 400);
  }

  validateStatus(status);

  const passHash = await bcrypt.hash(password, 10);

  const createdUser = await prisma.users.create({
    data: {
      role_id: role.role_id,
      user_name: userName,
      pass_hash: passHash,
      full_name: fullName,
      email,
      phone,
      status,
    },
    include: userInclude,
  });

  return mapAdminUserToDto(createdUser);
};

/**
 * PATCH /api/admin/users/:userId/status
 * Khóa/mở tài khoản.
 */
export const updateUserStatusService = async (
  targetUserId: number,
  currentAdminUserId: number,
  body: UpdateUserStatusBody
): Promise<AdminUserDto> => {
  if (!targetUserId || Number.isNaN(targetUserId)) {
    throw new AdminUserServiceError("userId không hợp lệ", 400);
  }

  if (targetUserId === currentAdminUserId) {
    throw new AdminUserServiceError(
      "Bạn không thể tự khóa/mở khóa chính tài khoản của mình",
      400
    );
  }

  const status = Number(body.status);

  if (Number.isNaN(status)) {
    throw new AdminUserServiceError("status không hợp lệ", 400);
  }

  validateStatus(status);

  const existedUser = await prisma.users.findUnique({
    where: {
      user_id: targetUserId,
    },
    select: {
      user_id: true,
    },
  });

  if (!existedUser) {
    throw new AdminUserServiceError("Không tìm thấy tài khoản", 404);
  }

  const updatedUser = await prisma.users.update({
    where: {
      user_id: targetUserId,
    },
    data: {
      status,
    },
    include: userInclude,
  });

  return mapAdminUserToDto(updatedUser);
};

/**
 * PATCH /api/admin/users/:userId/role
 * Đổi role tài khoản.
 */
export const updateUserRoleService = async (
  targetUserId: number,
  currentAdminUserId: number,
  body: UpdateUserRoleBody
): Promise<AdminUserDto> => {
  if (!targetUserId || Number.isNaN(targetUserId)) {
    throw new AdminUserServiceError("userId không hợp lệ", 400);
  }

  if (targetUserId === currentAdminUserId) {
    throw new AdminUserServiceError(
      "Bạn không thể tự đổi role của chính tài khoản mình",
      400
    );
  }

  const existedUser = await prisma.users.findUnique({
    where: {
      user_id: targetUserId,
    },
    select: {
      user_id: true,
    },
  });

  if (!existedUser) {
    throw new AdminUserServiceError("Không tìm thấy tài khoản", 404);
  }

  const role = await findRole({
    roleId: body.roleId,
    roleName: body.roleName,
  });

  const updatedUser = await prisma.users.update({
    where: {
      user_id: targetUserId,
    },
    data: {
      role_id: role.role_id,
    },
    include: userInclude,
  });

  return mapAdminUserToDto(updatedUser);
};

/**
 * PATCH /api/admin/users/:userId/password
 * Admin reset mật khẩu tài khoản.
 */
export const resetUserPasswordService = async (
  targetUserId: number,
  body: ResetUserPasswordBody
): Promise<AdminUserDto> => {
  if (!targetUserId || Number.isNaN(targetUserId)) {
    throw new AdminUserServiceError("userId không hợp lệ", 400);
  }

  const password = validatePassword(body.password);

  const existedUser = await prisma.users.findUnique({
    where: {
      user_id: targetUserId,
    },
    select: {
      user_id: true,
    },
  });

  if (!existedUser) {
    throw new AdminUserServiceError("Không tìm thấy tài khoản", 404);
  }

  const passHash = await bcrypt.hash(password, 10);

  const updatedUser = await prisma.users.update({
    where: {
      user_id: targetUserId,
    },
    data: {
      pass_hash: passHash,
    },
    include: userInclude,
  });

  return mapAdminUserToDto(updatedUser);
};

/**
 * GET /api/admin/roles
 * Lấy danh sách role.
 */
export const getAdminRolesService = async (): Promise<AdminRoleDto[]> => {
  const roles = await prisma.roles.findMany({
    orderBy: {
      role_id: "asc",
    },
  });

  return roles.map(mapRoleToDto);
};