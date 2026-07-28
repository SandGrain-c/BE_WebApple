import { AdminRoleDto, AdminUserDto } from "./admin-user.dto";

/**
 * Chuyển Date sang ISO string.
 */
const toISOString = (value: any): string => {
  return value?.toISOString?.() ?? String(value);
};

/**
 * mapAdminUserToDto:
 * Chuyển dữ liệu user từ DB sang DTO cho FE Admin.
 */
export const mapAdminUserToDto = (user: any): AdminUserDto => {
  return {
    userId: user.user_id,
    roleId: user.role_id,
    roleName: user.roles?.role_name ?? "",

    userName: user.user_name,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,

    status: user.status,
    statusText: user.status === 1 ? "Active" : "Locked",

    createdAt: toISOString(user.created_at),
  };
};

/**
 * mapRoleToDto:
 * Chuyển role từ DB sang DTO.
 */
export const mapRoleToDto = (role: any): AdminRoleDto => {
  return {
    roleId: role.role_id,
    roleName: role.role_name,
  };
};