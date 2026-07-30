export type AdminLoginBody = {
    identifier: string;
    password: string;
  };
  
  export type AdminUserDto = {
    id: number;
    userName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: string;
  };
  
  export type AdminLoginResponseDto = {
    user: AdminUserDto;
    accessToken: string;
  };