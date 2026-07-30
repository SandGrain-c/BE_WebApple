export type AdminUserDto = {
    userId: number;
    roleId: number;
    roleName: string;
  
    userName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  
    status: number;
    statusText: "Active" | "Locked";
  
    createdAt: string;
  };
  
  export type AdminRoleDto = {
    roleId: number;
    roleName: string;
  };
  
  export type AdminUserListResponseDto = {
    items: AdminUserDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminUsersQuery = {
    search?: string;
    roleId?: string;
    roleName?: string;
    status?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type CreateAdminUserBody = {
    userName: string;
    fullName: string;
    password: string;
  
    email?: string | null;
    phone?: string | null;
  
    roleId?: number;
    roleName?: string;
  
    status?: number;
  };
  
  export type UpdateUserStatusBody = {
    status: number;
  };
  
  export type UpdateUserRoleBody = {
    roleId?: number;
    roleName?: string;
  };
  
  export type ResetUserPasswordBody = {
    password: string;
  };