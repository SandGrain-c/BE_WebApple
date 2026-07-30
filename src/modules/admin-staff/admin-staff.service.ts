// src/modules/admin-staff/admin-staff.service.ts

import bcrypt from "bcrypt";
import prisma from "../../utils/prisma";
import {
  MANAGEABLE_STAFF_ROLES,
  ROLE,
  ROLE_PERMISSION_MATRIX,
  type RoleName,
} from "../../constants/role.constant";
import type {
  AdminRolePermissionDto,
  AdminStaffDto,
  AdminStaffListResponseDto,
  CreateAdminStaffBody,
  GetAdminStaffQuery,
  ResetStaffPasswordBody,
  UpdateAdminStaffBody,
  UpdateStaffRoleBody,
  UpdateStaffStatusBody,
} from "./admin-staff.dto";
import { mapAdminStaffToDto, mapRolePermissions } from "./admin-staff.mapper";

export class AdminStaffServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const parsePage = (value: unknown) => {
  const page = Number(value) || 1;
  return Number.isInteger(page) && page > 0 ? page : 1;
};

const parseLimit = (value: unknown) => {
  const limit = Number(value) || 10;
  if (!Number.isInteger(limit) || limit <= 0) return 10;
  return Math.min(limit, 100);
};

const parseStatus = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const status = Number(value);

  if (status !== 0 && status !== 1) {
    throw new AdminStaffServiceError("Trạng thái tài khoản không hợp lệ", 400);
  }

  return status;
};

const parseRequiredDate = (value?: string) => {
  const text = normalizeText(value);

  if (!text) {
    throw new AdminStaffServiceError("Vui lòng nhập ngày vào làm", 400);
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new AdminStaffServiceError("Ngày vào làm không hợp lệ", 400);
  }

  return date;
};

const parseOptionalDate = (value?: string) => {
  if (value === undefined) return undefined;

  const text = normalizeText(value);

  if (!text) {
    throw new AdminStaffServiceError("Ngày vào làm không hợp lệ", 400);
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new AdminStaffServiceError("Ngày vào làm không hợp lệ", 400);
  }

  return date;
};

const parseOptionalSalary = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const salary = Number(value);

  if (Number.isNaN(salary) || salary < 0) {
    throw new AdminStaffServiceError("Lương cơ bản không hợp lệ", 400);
  }

  return salary;
};

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone: string) => {
  return /^[0-9]{10,11}$/.test(phone);
};

const isValidPassword = (password: string) => {
  return password.length >= 6;
};

const assertManageableRole = (roleName?: string | null): RoleName => {
  const role = normalizeText(roleName) as RoleName | null;

  if (!role) {
    throw new AdminStaffServiceError("Vui lòng chọn role nhân viên", 400);
  }

  if (!MANAGEABLE_STAFF_ROLES.includes(role as any)) {
    throw new AdminStaffServiceError(
      "Role không hợp lệ hoặc không được phép gán cho nhân viên",
      400
    );
  }

  return role;
};

const getRoleByName = async (roleName: RoleName) => {
  const role = await prisma.roles.findUnique({
    where: {
      role_name: roleName,
    },
  });

  if (!role) {
    throw new AdminStaffServiceError(
      `Role ${roleName} chưa tồn tại trong database`,
      404
    );
  }

  return role;
};

const ensureUniqueUserFields = async (
  data: {
    userName?: string | null;
    email?: string | null;
    phone?: string | null;
    citizenId?: string | null;
  },
  ignoreUserId?: number
) => {
  if (data.userName) {
    const existed = await prisma.users.findFirst({
      where: {
        user_name: data.userName,
        ...(ignoreUserId
          ? {
              NOT: {
                user_id: ignoreUserId,
              },
            }
          : {}),
      },
    });

    if (existed) {
      throw new AdminStaffServiceError("Tên đăng nhập đã tồn tại", 409);
    }
  }

  if (data.email) {
    const existed = await prisma.users.findFirst({
      where: {
        email: data.email,
        ...(ignoreUserId
          ? {
              NOT: {
                user_id: ignoreUserId,
              },
            }
          : {}),
      },
    });

    if (existed) {
      throw new AdminStaffServiceError("Email đã được sử dụng", 409);
    }
  }

  if (data.phone) {
    const existed = await prisma.users.findFirst({
      where: {
        phone: data.phone,
        ...(ignoreUserId
          ? {
              NOT: {
                user_id: ignoreUserId,
              },
            }
          : {}),
      },
    });

    if (existed) {
      throw new AdminStaffServiceError("Số điện thoại đã được sử dụng", 409);
    }
  }

  if (data.citizenId) {
    const existed = await prisma.staff_profiles.findFirst({
      where: {
        citizen_id: data.citizenId,
        ...(ignoreUserId
          ? {
              NOT: {
                user_id: ignoreUserId,
              },
            }
          : {}),
      },
    });

    if (existed) {
      throw new AdminStaffServiceError("CCCD/CMND đã được sử dụng", 409);
    }
  }
};

const createAuditLog = async (
  tx: any,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  oldValue: unknown,
  newValue: unknown
) => {
  await tx.audit_logs.create({
    data: {
      user_id: actorId || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
    },
  });
};

const getStaffProfileMap = async (userIds: number[]) => {
  if (userIds.length === 0) {
    return new Map<number, any>();
  }

  const profiles = await prisma.staff_profiles.findMany({
    where: {
      user_id: {
        in: userIds,
      },
    },
  });

  return new Map(profiles.map((profile) => [profile.user_id, profile]));
};

export const getAdminStaffRolesService =
  async (): Promise<AdminRolePermissionDto[]> => {
    return mapRolePermissions();
  };

export const getAdminStaffListService = async (
  query: GetAdminStaffQuery
): Promise<AdminStaffListResponseDto> => {
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);
  const skip = (page - 1) * limit;

  const keyword = normalizeText(query.q);
  const status = parseStatus(query.status);
  const roleName = query.roleName ? assertManageableRole(query.roleName) : null;

  const where: any = {
    roles: {
      role_name: {
        in: [...MANAGEABLE_STAFF_ROLES],
      },
    },
  };

  if (roleName) {
    where.roles = {
      role_name: roleName,
    };
  }

  if (status !== null) {
    where.status = status;
  }

  if (keyword) {
    where.OR = [
      {
        user_name: {
          contains: keyword,
          mode: "insensitive",
        },
      },
      {
        full_name: {
          contains: keyword,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: keyword,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: keyword,
          mode: "insensitive",
        },
      },
    ];
  }

  const [users, totalItems] = await Promise.all([
    prisma.users.findMany({
      where,
      include: {
        roles: true,
      },
      orderBy: {
        user_id: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.users.count({ where }),
  ]);

  const profileMap = await getStaffProfileMap(users.map((user) => user.user_id));

  return {
    items: users.map((user) =>
      mapAdminStaffToDto(user, profileMap.get(user.user_id) ?? null)
    ),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getAdminStaffDetailService = async (
  userId: number
): Promise<AdminStaffDto> => {
  const user = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    include: {
      roles: true,
    },
  });

  if (!user || !MANAGEABLE_STAFF_ROLES.includes(user.roles.role_name as any)) {
    throw new AdminStaffServiceError("Không tìm thấy nhân viên", 404);
  }

  const profile = await prisma.staff_profiles.findUnique({
    where: {
      user_id: userId,
    },
  });

  return mapAdminStaffToDto(user, profile);
};

export const createAdminStaffService = async (
  actorId: number,
  body: CreateAdminStaffBody
): Promise<AdminStaffDto> => {
  const userName = normalizeText(body.userName);
  const fullName = normalizeText(body.fullName);
  const email = normalizeText(body.email);
  const phone = normalizeText(body.phone);
  const password = normalizeText(body.password);
  const citizenId = normalizeText(body.citizenId);
  const branch = normalizeText(body.branch);
  const roleName = assertManageableRole(body.roleName);
  const status = body.status === 0 ? 0 : 1;
  const hireDate = parseRequiredDate(body.hireDate);
  const baseSalary = parseOptionalSalary(body.baseSalary) ?? null;

  if (!userName || userName.length < 3 || userName.length > 25) {
    throw new AdminStaffServiceError(
      "Tên đăng nhập phải từ 3 đến 25 ký tự",
      400
    );
  }

  if (!fullName) {
    throw new AdminStaffServiceError("Vui lòng nhập họ tên nhân viên", 400);
  }

  if (!email && !phone) {
    throw new AdminStaffServiceError(
      "Vui lòng nhập email hoặc số điện thoại",
      400
    );
  }

  if (email && !isValidEmail(email)) {
    throw new AdminStaffServiceError("Email không hợp lệ", 400);
  }

  if (phone && !isValidPhone(phone)) {
    throw new AdminStaffServiceError("Số điện thoại không hợp lệ", 400);
  }

  if (!password || !isValidPassword(password)) {
    throw new AdminStaffServiceError("Mật khẩu phải có ít nhất 6 ký tự", 400);
  }

  if (!citizenId) {
    throw new AdminStaffServiceError("Vui lòng nhập CCCD/CMND", 400);
  }

  await ensureUniqueUserFields({
    userName,
    email,
    phone,
    citizenId,
  });

  const role = await getRoleByName(roleName);
  const passwordHash = await bcrypt.hash(password, 10);

  const createdUserId = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        role_id: role.role_id,
        email,
        phone,
        user_name: userName,
        pass_hash: passwordHash,
        full_name: fullName,
        status,
      },
    });

    await tx.staff_profiles.create({
      data: {
        user_id: user.user_id,
        citizen_id: citizenId,
        hire_date: hireDate,
        base_salary: baseSalary,
        branch,
      },
    });

    await createAuditLog(
      tx,
      actorId,
      "CREATE_STAFF_ACCOUNT",
      "users",
      user.user_id,
      null,
      {
        userId: user.user_id,
        userName,
        fullName,
        roleName,
        status,
        citizenId,
        hireDate: hireDate.toISOString().slice(0, 10),
        baseSalary,
        branch,
      }
    );

    return user.user_id;
  });

  return getAdminStaffDetailService(createdUserId);
};

export const updateAdminStaffService = async (
  actorId: number,
  userId: number,
  body: UpdateAdminStaffBody
): Promise<AdminStaffDto> => {
  const currentUser = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    include: {
      roles: true,
    },
  });

  if (
    !currentUser ||
    !MANAGEABLE_STAFF_ROLES.includes(currentUser.roles.role_name as any)
  ) {
    throw new AdminStaffServiceError("Không tìm thấy nhân viên", 404);
  }

  const currentProfile = await prisma.staff_profiles.findUnique({
    where: {
      user_id: userId,
    },
  });

  const updateUserData: any = {};
  const updateProfileData: any = {};

  if (body.userName !== undefined) {
    const userName = normalizeText(body.userName);

    if (!userName || userName.length < 3 || userName.length > 25) {
      throw new AdminStaffServiceError(
        "Tên đăng nhập phải từ 3 đến 25 ký tự",
        400
      );
    }

    updateUserData.user_name = userName;
  }

  if (body.fullName !== undefined) {
    const fullName = normalizeText(body.fullName);

    if (!fullName) {
      throw new AdminStaffServiceError("Họ tên không được để trống", 400);
    }

    updateUserData.full_name = fullName;
  }

  if (body.email !== undefined) {
    const email = normalizeText(body.email);

    if (email && !isValidEmail(email)) {
      throw new AdminStaffServiceError("Email không hợp lệ", 400);
    }

    updateUserData.email = email;
  }

  if (body.phone !== undefined) {
    const phone = normalizeText(body.phone);

    if (phone && !isValidPhone(phone)) {
      throw new AdminStaffServiceError("Số điện thoại không hợp lệ", 400);
    }

    updateUserData.phone = phone;
  }

  if (body.roleName !== undefined) {
    if (userId === actorId) {
      throw new AdminStaffServiceError(
        "Admin không được tự đổi role của chính mình",
        400
      );
    }

    const roleName = assertManageableRole(body.roleName);
    const role = await getRoleByName(roleName);
    updateUserData.role_id = role.role_id;
  }

  if (body.status !== undefined) {
    const status = parseStatus(body.status);

    if (status === null) {
      throw new AdminStaffServiceError("Trạng thái tài khoản không hợp lệ", 400);
    }

    if (userId === actorId && status === 0) {
      throw new AdminStaffServiceError(
        "Admin không được tự khóa tài khoản của chính mình",
        400
      );
    }

    updateUserData.status = status;
  }

  if (body.citizenId !== undefined) {
    const citizenId = normalizeText(body.citizenId);

    if (!citizenId) {
      throw new AdminStaffServiceError("CCCD/CMND không được để trống", 400);
    }

    updateProfileData.citizen_id = citizenId;
  }

  if (body.hireDate !== undefined) {
    updateProfileData.hire_date = parseOptionalDate(body.hireDate);
  }

  if (body.baseSalary !== undefined) {
    updateProfileData.base_salary = parseOptionalSalary(body.baseSalary);
  }

  if (body.branch !== undefined) {
    updateProfileData.branch = normalizeText(body.branch);
  }

  if (
    Object.keys(updateUserData).length === 0 &&
    Object.keys(updateProfileData).length === 0
  ) {
    throw new AdminStaffServiceError("Không có thông tin nào để cập nhật", 400);
  }

  await ensureUniqueUserFields(
    {
      userName: updateUserData.user_name,
      email: updateUserData.email,
      phone: updateUserData.phone,
      citizenId: updateProfileData.citizen_id,
    },
    userId
  );

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updateUserData).length > 0) {
      await tx.users.update({
        where: {
          user_id: userId,
        },
        data: updateUserData,
      });
    }

    if (Object.keys(updateProfileData).length > 0) {
      if (currentProfile) {
        await tx.staff_profiles.update({
          where: {
            user_id: userId,
          },
          data: updateProfileData,
        });
      } else {
        const citizenId = updateProfileData.citizen_id;

        if (!citizenId || !updateProfileData.hire_date) {
          throw new AdminStaffServiceError(
            "Nhân viên chưa có hồ sơ, cần nhập CCCD/CMND và ngày vào làm",
            400
          );
        }

        await tx.staff_profiles.create({
          data: {
            user_id: userId,
            citizen_id: citizenId,
            hire_date: updateProfileData.hire_date,
            base_salary: updateProfileData.base_salary ?? null,
            branch: updateProfileData.branch ?? null,
          },
        });
      }
    }

    await createAuditLog(
      tx,
      actorId,
      "UPDATE_STAFF_ACCOUNT",
      "users",
      userId,
      {
        user: currentUser,
        staffProfile: currentProfile,
      },
      {
        user: updateUserData,
        staffProfile: updateProfileData,
      }
    );
  });

  return getAdminStaffDetailService(userId);
};

export const updateAdminStaffStatusService = async (
  actorId: number,
  userId: number,
  body: UpdateStaffStatusBody
): Promise<AdminStaffDto> => {
  const status = parseStatus(body.status);

  if (status === null) {
    throw new AdminStaffServiceError("Trạng thái tài khoản không hợp lệ", 400);
  }

  return updateAdminStaffService(actorId, userId, { status });
};

export const updateAdminStaffRoleService = async (
  actorId: number,
  userId: number,
  body: UpdateStaffRoleBody
): Promise<AdminStaffDto> => {
  return updateAdminStaffService(actorId, userId, {
    roleName: body.roleName,
  });
};

export const resetAdminStaffPasswordService = async (
  actorId: number,
  userId: number,
  body: ResetStaffPasswordBody
): Promise<void> => {
  const newPassword = normalizeText(body.newPassword);
  const confirmPassword = normalizeText(body.confirmPassword);

  if (!newPassword || !isValidPassword(newPassword)) {
    throw new AdminStaffServiceError("Mật khẩu mới phải có ít nhất 6 ký tự", 400);
  }

  if (newPassword !== confirmPassword) {
    throw new AdminStaffServiceError("Xác nhận mật khẩu không khớp", 400);
  }

  const user = await prisma.users.findUnique({
    where: {
      user_id: userId,
    },
    include: {
      roles: true,
    },
  });

  if (!user || !MANAGEABLE_STAFF_ROLES.includes(user.roles.role_name as any)) {
    throw new AdminStaffServiceError("Không tìm thấy nhân viên", 404);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: {
        user_id: userId,
      },
      data: {
        pass_hash: passwordHash,
      },
    });

    await createAuditLog(
      tx,
      actorId,
      "RESET_STAFF_PASSWORD",
      "users",
      userId,
      null,
      {
        resetBy: actorId,
      }
    );
  });
};
