// src/modules/user-address.service.ts

import prisma from "../../utils/prisma";
import {
  CreateUserAddressBody,
  UpdateUserAddressBody,
  UserAddressDto,
} from "./user-address.dto";
import { mapUserAddressToDto } from "./user-address.mapper";

export class UserAddressServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Chuẩn hóa text: bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Lấy userId từ JWT.
 */
const validateUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new UserAddressServiceError("Bạn chưa đăng nhập", 401);
  }
};

/**
 * Validate dữ liệu tạo/cập nhật địa chỉ.
 */
const validateAddressRequiredFields = (body: CreateUserAddressBody) => {
  const receiverName = normalizeText(body.receiverName);
  const receiverPhone = normalizeText(body.receiverPhone);
  const detailedAddress = normalizeText(body.detailedAddress);
  const ward = normalizeText(body.ward);
  const city = normalizeText(body.city);

  if (!receiverName) {
    throw new UserAddressServiceError("Vui lòng nhập tên người nhận", 400);
  }

  if (!receiverPhone) {
    throw new UserAddressServiceError("Vui lòng nhập số điện thoại người nhận", 400);
  }

  if (!detailedAddress) {
    throw new UserAddressServiceError("Vui lòng nhập địa chỉ chi tiết", 400);
  }

  if (!ward) {
    throw new UserAddressServiceError("Vui lòng nhập phường/xã", 400);
  }

  if (!city) {
    throw new UserAddressServiceError("Vui lòng nhập tỉnh/thành phố", 400);
  }

  return {
    receiverName,
    receiverPhone,
    detailedAddress,
    ward,
    city,
  };
};

/**
 * GET /api/user/addresses
 * Lấy danh sách địa chỉ của user hiện tại.
 */
export const getMyAddressesService = async (
  userId: number
): Promise<UserAddressDto[]> => {
  validateUserId(userId);

  const addresses = await prisma.user_addresses.findMany({
    where: {
      user_id: userId,
    },
    orderBy: [
      {
        is_default: "desc",
      },
      {
        address_id: "asc",
      },
    ],
  });

  return addresses.map(mapUserAddressToDto);
};

/**
 * GET /api/user/addresses/:addressId
 * Lấy chi tiết một địa chỉ.
 */
export const getMyAddressDetailService = async (
  userId: number,
  addressId: number
): Promise<UserAddressDto> => {
  validateUserId(userId);

  if (!addressId || Number.isNaN(addressId)) {
    throw new UserAddressServiceError("addressId không hợp lệ", 400);
  }

  const address = await prisma.user_addresses.findFirst({
    where: {
      address_id: addressId,
      user_id: userId,
    },
  });

  if (!address) {
    throw new UserAddressServiceError("Không tìm thấy địa chỉ", 404);
  }

  return mapUserAddressToDto(address);
};

/**
 * POST /api/user/addresses
 * Tạo địa chỉ mới.
 */
export const createMyAddressService = async (
  userId: number,
  body: CreateUserAddressBody
): Promise<UserAddressDto> => {
  validateUserId(userId);

  const validated = validateAddressRequiredFields(body);

  const createdAddress = await prisma.$transaction(async (tx) => {
    const addressCount = await tx.user_addresses.count({
      where: {
        user_id: userId,
      },
    });

    /**
     * Nếu đây là địa chỉ đầu tiên, tự động đặt mặc định.
     * Nếu FE gửi isDefault=true, bỏ mặc định cũ.
     */
    const shouldSetDefault = body.isDefault === true || addressCount === 0;

    if (shouldSetDefault) {
      await tx.user_addresses.updateMany({
        where: {
          user_id: userId,
          is_default: true,
        },
        data: {
          is_default: false,
        },
      });
    }

    return tx.user_addresses.create({
      data: {
        user_id: userId,
        receiver_name: validated.receiverName,
        receiver_phone: validated.receiverPhone,
        detailed_address: validated.detailedAddress,
        ward: validated.ward,
        city: validated.city,
        is_default: shouldSetDefault,
      },
    });
  });

  return mapUserAddressToDto(createdAddress);
};

/**
 * PATCH /api/user/addresses/:addressId
 * Cập nhật địa chỉ.
 */
export const updateMyAddressService = async (
  userId: number,
  addressId: number,
  body: UpdateUserAddressBody
): Promise<UserAddressDto> => {
  validateUserId(userId);

  if (!addressId || Number.isNaN(addressId)) {
    throw new UserAddressServiceError("addressId không hợp lệ", 400);
  }

  const existedAddress = await prisma.user_addresses.findFirst({
    where: {
      address_id: addressId,
      user_id: userId,
    },
  });

  if (!existedAddress) {
    throw new UserAddressServiceError("Không tìm thấy địa chỉ", 404);
  }

  const data: any = {};

  if (body.receiverName !== undefined) {
    const receiverName = normalizeText(body.receiverName);

    if (!receiverName) {
      throw new UserAddressServiceError("Tên người nhận không được để trống", 400);
    }

    data.receiver_name = receiverName;
  }

  if (body.receiverPhone !== undefined) {
    const receiverPhone = normalizeText(body.receiverPhone);

    if (!receiverPhone) {
      throw new UserAddressServiceError("Số điện thoại không được để trống", 400);
    }

    data.receiver_phone = receiverPhone;
  }

  if (body.detailedAddress !== undefined) {
    const detailedAddress = normalizeText(body.detailedAddress);

    if (!detailedAddress) {
      throw new UserAddressServiceError("Địa chỉ chi tiết không được để trống", 400);
    }

    data.detailed_address = detailedAddress;
  }

  if (body.ward !== undefined) {
    const ward = normalizeText(body.ward);

    if (!ward) {
      throw new UserAddressServiceError("Phường/xã không được để trống", 400);
    }

    data.ward = ward;
  }

  if (body.city !== undefined) {
    const city = normalizeText(body.city);

    if (!city) {
      throw new UserAddressServiceError("Tỉnh/thành phố không được để trống", 400);
    }

    data.city = city;
  }

  const updatedAddress = await prisma.$transaction(async (tx) => {
    /**
     * Nếu FE gửi isDefault=true, đặt địa chỉ này làm mặc định.
     * Nếu isDefault=false thì không xử lý ở đây để tránh user không còn địa chỉ mặc định.
     */
    if (body.isDefault === true) {
      await tx.user_addresses.updateMany({
        where: {
          user_id: userId,
          is_default: true,
        },
        data: {
          is_default: false,
        },
      });

      data.is_default = true;
    }

    return tx.user_addresses.update({
      where: {
        address_id: addressId,
      },
      data,
    });
  });

  return mapUserAddressToDto(updatedAddress);
};

/**
 * PATCH /api/user/addresses/:addressId/default
 * Đặt một địa chỉ làm mặc định.
 */
export const setDefaultMyAddressService = async (
  userId: number,
  addressId: number
): Promise<UserAddressDto> => {
  validateUserId(userId);

  if (!addressId || Number.isNaN(addressId)) {
    throw new UserAddressServiceError("addressId không hợp lệ", 400);
  }

  const updatedAddress = await prisma.$transaction(async (tx) => {
    const existedAddress = await tx.user_addresses.findFirst({
      where: {
        address_id: addressId,
        user_id: userId,
      },
    });

    if (!existedAddress) {
      throw new UserAddressServiceError("Không tìm thấy địa chỉ", 404);
    }

    await tx.user_addresses.updateMany({
      where: {
        user_id: userId,
        is_default: true,
      },
      data: {
        is_default: false,
      },
    });

    return tx.user_addresses.update({
      where: {
        address_id: addressId,
      },
      data: {
        is_default: true,
      },
    });
  });

  return mapUserAddressToDto(updatedAddress);
};

/**
 * DELETE /api/user/addresses/:addressId
 * Xóa địa chỉ nếu chưa phát sinh đơn hàng.
 */
export const deleteMyAddressService = async (
  userId: number,
  addressId: number
): Promise<UserAddressDto> => {
  validateUserId(userId);

  if (!addressId || Number.isNaN(addressId)) {
    throw new UserAddressServiceError("addressId không hợp lệ", 400);
  }

  const deletedAddress = await prisma.$transaction(async (tx) => {
    const existedAddress = await tx.user_addresses.findFirst({
      where: {
        address_id: addressId,
        user_id: userId,
      },
    });

    if (!existedAddress) {
      throw new UserAddressServiceError("Không tìm thấy địa chỉ", 404);
    }

    /**
     * Nếu địa chỉ đã gắn với đơn hàng thì không xóa,
     * vì orders.address_id đang liên kết khóa ngoại.
     */
    const orderCount = await tx.orders.count({
      where: {
        address_id: addressId,
      },
    });

    if (orderCount > 0) {
      throw new UserAddressServiceError(
        "Địa chỉ đã phát sinh đơn hàng, không thể xóa",
        409
      );
    }

    await tx.user_addresses.delete({
      where: {
        address_id: addressId,
      },
    });

    /**
     * Nếu xóa địa chỉ mặc định, tự động chọn địa chỉ khác làm mặc định.
     */
    if (existedAddress.is_default) {
      const nextAddress = await tx.user_addresses.findFirst({
        where: {
          user_id: userId,
        },
        orderBy: {
          address_id: "asc",
        },
      });

      if (nextAddress) {
        await tx.user_addresses.update({
          where: {
            address_id: nextAddress.address_id,
          },
          data: {
            is_default: true,
          },
        });
      }
    }

    return existedAddress;
  });

  return mapUserAddressToDto(deletedAddress);
};