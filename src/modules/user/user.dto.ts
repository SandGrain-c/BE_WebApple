// src/modules/user/user.dto.ts

export type UpdateUserProfileBody = {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  
  export type UserProfileDto = {
    id: number;
    userName: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
  };

  export type UpdateUserPasswordBody = {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };