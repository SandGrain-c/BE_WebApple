// src/modules/user-address/user-address.dto.ts

export type UserAddressDto = {
    addressId: number;
    userId: number;
    receiverName: string;
    receiverPhone: string;
    detailedAddress: string;
    ward: string;
    city: string;
    fullAddress: string;
    isDefault: boolean;
  };
  
  export type CreateUserAddressBody = {
    receiverName: string;
    receiverPhone: string;
    detailedAddress: string;
    ward: string;
    city: string;
    isDefault?: boolean;
  };
  
  export type UpdateUserAddressBody = {
    receiverName?: string;
    receiverPhone?: string;
    detailedAddress?: string;
    ward?: string;
    city?: string;
    isDefault?: boolean;
  };