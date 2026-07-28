// src/modules/admin-staff/admin-staff.dto.ts

import type { RoleName } from "../../constants/role.constant";

export type AdminStaffStatus = 0 | 1;

export type GetAdminStaffQuery = {
  q?: string;
  roleName?: RoleName;
  status?: string | number;
  page?: string | number;
  limit?: string | number;
};

export type CreateAdminStaffBody = {
  userName?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  password?: string;
  roleName?: RoleName;
  status?: AdminStaffStatus;

  citizenId?: string;
  hireDate?: string;
  baseSalary?: number | string | null;
  branch?: string | null;
};

export type UpdateAdminStaffBody = {
  userName?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  roleName?: RoleName;
  status?: AdminStaffStatus;

  citizenId?: string;
  hireDate?: string;
  baseSalary?: number | string | null;
  branch?: string | null;
};

export type UpdateStaffStatusBody = {
  status?: AdminStaffStatus;
};

export type UpdateStaffRoleBody = {
  roleName?: RoleName;
};

export type ResetStaffPasswordBody = {
  newPassword?: string;
  confirmPassword?: string;
};

export type AdminStaffDto = {
  userId: number;
  userName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: AdminStaffStatus;
  statusText: "Active" | "Locked";
  role: {
    roleId: number;
    roleName: string;
  };
  staffProfile: {
    staffId: number;
    citizenId: string;
    hireDate: string;
    baseSalary: number | null;
    branch: string | null;
  } | null;
  createdAt: string;
};

export type AdminStaffListResponseDto = {
  items: AdminStaffDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AdminRolePermissionDto = {
  roleName: string;
  description: string;
  permissions: readonly string[];
};
