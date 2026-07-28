// src/modules/user-address/user-address.mapper.ts

import { UserAddressDto } from "./user-address.dto";

/**
 * Ghép địa chỉ đầy đủ để FE hiển thị nhanh.
 */
const buildFullAddress = (address: any) => {
  return [
    address.detailed_address,
    address.ward,
    address.city,
  ]
    .filter(Boolean)
    .join(", ");
};

/**
 * mapUserAddressToDto:
 * Chuyển dữ liệu DB từ snake_case sang camelCase cho FE.
 */
export const mapUserAddressToDto = (address: any): UserAddressDto => {
  return {
    addressId: address.address_id,
    userId: address.user_id,
    receiverName: address.receiver_name,
    receiverPhone: address.receiver_phone,
    detailedAddress: address.detailed_address,
    ward: address.ward,
    city: address.city,
    fullAddress: buildFullAddress(address),
    isDefault: address.is_default,
  };
};