// src/modules/auth/auth.dto.ts

export type RegisterPayload = {
    userName: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    password: string;
  };
  
  export type LoginPayload = {
    identifier: string;
    password: string;
  };
  
  export type AuthUserDto = {
    id: number;
    userName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: string;
  };
  
  export type AuthResponseDto = {
    user: AuthUserDto;
    accessToken: string;
  };