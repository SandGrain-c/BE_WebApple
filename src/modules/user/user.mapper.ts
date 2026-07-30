// src/modules/user/user.mapper.ts

import { UserProfileDto } from "./user.dto";

/**
 * Mapper = hàm chuyển dữ liệu DB sang dữ liệu trả về cho FE.
 */
export function mapUserProfileToDto(user: any): UserProfileDto {
  return {
    id: user.user_id,
    userName: user.user_name,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.roles?.role_name ?? null,
  };
}