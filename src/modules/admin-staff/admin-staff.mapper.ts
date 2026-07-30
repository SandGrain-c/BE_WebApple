// src/modules/admin-staff/admin-staff.mapper.ts

import { ROLE, ROLE_PERMISSION_MATRIX } from "../../constants/role.constant";
import type { AdminRolePermissionDto, AdminStaffDto } from "./admin-staff.dto";

export const mapAdminStaffToDto = (
  user: any,
  staffProfile?: any | null
): AdminStaffDto => {
  return {
    userId: user.user_id,
    userName: user.user_name,
    fullName: user.full_name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    status: user.status,
    statusText: user.status === 1 ? "Active" : "Locked",
    role: {
      roleId: user.roles?.role_id ?? user.role_id,
      roleName: user.roles?.role_name ?? "",
    },
    staffProfile: staffProfile
      ? {
          staffId: staffProfile.staff_id,
          citizenId: staffProfile.citizen_id,
          hireDate: staffProfile.hire_date
            ? staffProfile.hire_date.toISOString().slice(0, 10)
            : "",
          baseSalary:
            staffProfile.base_salary === null ||
            staffProfile.base_salary === undefined
              ? null
              : Number(staffProfile.base_salary),
          branch: staffProfile.branch ?? null,
        }
      : null,
    createdAt: user.created_at ? user.created_at.toISOString() : "",
  };
};

export const mapRolePermissions = (): AdminRolePermissionDto[] => {
  return [
    {
      roleName: ROLE.ADMIN,
      description: "Quản trị viên toàn quyền",
      permissions: ROLE_PERMISSION_MATRIX[ROLE.ADMIN],
    },
    {
      roleName: ROLE.STAFF,
      description: "Nhân viên quản lý bán hàng, sản phẩm, đơn hàng",
      permissions: ROLE_PERMISSION_MATRIX[ROLE.STAFF],
    },
    {
      roleName: ROLE.WAREHOUSE_STAFF,
      description: "Nhân viên kho, quản lý nhập kho, serial và vận chuyển",
      permissions: ROLE_PERMISSION_MATRIX[ROLE.WAREHOUSE_STAFF],
    },
  ];
};
