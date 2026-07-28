import prisma from "../../utils/prisma";
import {
  AdminVoucherDto,
  AdminVoucherListResponseDto,
  CreateAdminVoucherBody,
  GetAdminVouchersQuery,
  UpdateAdminVoucherBody,
} from "./admin-voucher.dto";
import { mapAdminVoucherToDto } from "./admin-voucher.mapper";

export class AdminVoucherServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeCode = (code?: string | null) => {
  const text = code?.trim().toUpperCase();
  return text || null;
};

const normalizeDiscountType = (discountType?: string | null) => {
  if (!discountType) return null;

  if (["Percent", "PERCENT", "percent", "Percentage"].includes(discountType)) {
    return "Percent";
  }

  if (["Fixed", "FIXED", "fixed", "Amount"].includes(discountType)) {
    return "Fixed";
  }

  return null;
};

const parseNullableNumber = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null || value === "") return null;

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    throw new AdminVoucherServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return numberValue;
};

const parseNullableDate = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null || value === "") return null;

  const dateValue = new Date(String(value));

  if (Number.isNaN(dateValue.getTime())) {
    throw new AdminVoucherServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return dateValue;
};

const ensureVoucherCodeUnique = async (code: string, voucherId?: number) => {
  const existedVoucher = await prisma.vouchers.findFirst({
    where: {
      code,
      ...(voucherId
        ? {
            NOT: {
              voucher_id: voucherId,
            },
          }
        : {}),
    },
    select: {
      voucher_id: true,
    },
  });

  if (existedVoucher) {
    throw new AdminVoucherServiceError("Mã voucher đã tồn tại", 409);
  }
};

/**
 * GET /api/admin/vouchers
 */
export const getAdminVouchersService = async (
  query: GetAdminVouchersQuery
): Promise<AdminVoucherListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeCode(query.search);

  const where: any = {};

  if (search) {
    where.code = {
      contains: search,
      mode: "insensitive",
    };
  }

  if (query.isActive === "true") {
    where.is_active = true;
  }

  if (query.isActive === "false") {
    where.is_active = false;
  }

  let orderBy: any = {
    voucher_id: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { voucher_id: "asc" };
      break;
    case "used_desc":
      orderBy = { used_count: "desc" };
      break;
    case "used_asc":
      orderBy = { used_count: "asc" };
      break;
    default:
      orderBy = { voucher_id: "desc" };
      break;
  }

  const [items, totalItems] = await Promise.all([
    prisma.vouchers.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.vouchers.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminVoucherToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/vouchers/:voucherId
 */
export const getAdminVoucherDetailService = async (
  voucherId: number
): Promise<AdminVoucherDto> => {
  if (!voucherId || Number.isNaN(voucherId)) {
    throw new AdminVoucherServiceError("voucherId không hợp lệ", 400);
  }

  const voucher = await prisma.vouchers.findUnique({
    where: {
      voucher_id: voucherId,
    },
  });

  if (!voucher) {
    throw new AdminVoucherServiceError("Không tìm thấy voucher", 404);
  }

  return mapAdminVoucherToDto(voucher);
};

/**
 * POST /api/admin/vouchers
 */
export const createAdminVoucherService = async (
  body: CreateAdminVoucherBody
): Promise<AdminVoucherDto> => {
  const code = normalizeCode(body.code);

  if (!code) {
    throw new AdminVoucherServiceError("Vui lòng nhập mã voucher", 400);
  }

  await ensureVoucherCodeUnique(code);

  const discountType = normalizeDiscountType(body.discountType);

  if (!discountType) {
    throw new AdminVoucherServiceError(
      "Loại giảm giá chỉ được là Percent hoặc Fixed",
      400
    );
  }

  const discountValue = Number(body.discountValue);

  if (Number.isNaN(discountValue) || discountValue <= 0) {
    throw new AdminVoucherServiceError("Giá trị giảm giá không hợp lệ", 400);
  }

  if (discountType === "Percent" && discountValue > 100) {
    throw new AdminVoucherServiceError(
      "Giảm theo phần trăm không được lớn hơn 100",
      400
    );
  }

  const minOrderValue = parseNullableNumber(
    body.minOrderValue,
    "Giá trị đơn tối thiểu"
  );

  const maxDiscountAmount = parseNullableNumber(
    body.maxDiscountAmount,
    "Số tiền giảm tối đa"
  );

  const usageLimit = parseNullableNumber(body.usageLimit, "Giới hạn lượt dùng");

  const startDate = parseNullableDate(body.startDate, "Ngày bắt đầu");
  const endDate = parseNullableDate(body.endDate, "Ngày kết thúc");

  if (startDate && endDate && startDate > endDate) {
    throw new AdminVoucherServiceError(
      "Ngày bắt đầu không được lớn hơn ngày kết thúc",
      400
    );
  }

  const createdVoucher = await prisma.vouchers.create({
    data: {
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_value: minOrderValue,
      max_discount_amount: maxDiscountAmount,
      usage_limit: usageLimit,
      used_count: 0,
      start_date: startDate,
      end_date: endDate,
      is_active: body.isActive ?? true,
    },
  });

  return mapAdminVoucherToDto(createdVoucher);
};

/**
 * PATCH /api/admin/vouchers/:voucherId
 */
export const updateAdminVoucherService = async (
  voucherId: number,
  body: UpdateAdminVoucherBody
): Promise<AdminVoucherDto> => {
  if (!voucherId || Number.isNaN(voucherId)) {
    throw new AdminVoucherServiceError("voucherId không hợp lệ", 400);
  }

  const existedVoucher = await prisma.vouchers.findUnique({
    where: {
      voucher_id: voucherId,
    },
  });

  if (!existedVoucher) {
    throw new AdminVoucherServiceError("Không tìm thấy voucher", 404);
  }

  const data: any = {};

  if (body.code !== undefined) {
    const code = normalizeCode(body.code);

    if (!code) {
      throw new AdminVoucherServiceError("Mã voucher không được để trống", 400);
    }

    await ensureVoucherCodeUnique(code, voucherId);
    data.code = code;
  }

  if (body.discountType !== undefined) {
    const discountType = normalizeDiscountType(body.discountType);

    if (!discountType) {
      throw new AdminVoucherServiceError(
        "Loại giảm giá chỉ được là Percent hoặc Fixed",
        400
      );
    }

    data.discount_type = discountType;
  }

  if (body.discountValue !== undefined) {
    const discountValue = Number(body.discountValue);

    if (Number.isNaN(discountValue) || discountValue <= 0) {
      throw new AdminVoucherServiceError("Giá trị giảm giá không hợp lệ", 400);
    }

    const finalDiscountType = data.discount_type || existedVoucher.discount_type;

    if (finalDiscountType === "Percent" && discountValue > 100) {
      throw new AdminVoucherServiceError(
        "Giảm theo phần trăm không được lớn hơn 100",
        400
      );
    }

    data.discount_value = discountValue;
  }

  if (body.minOrderValue !== undefined) {
    data.min_order_value = parseNullableNumber(
      body.minOrderValue,
      "Giá trị đơn tối thiểu"
    );
  }

  if (body.maxDiscountAmount !== undefined) {
    data.max_discount_amount = parseNullableNumber(
      body.maxDiscountAmount,
      "Số tiền giảm tối đa"
    );
  }

  if (body.usageLimit !== undefined) {
    data.usage_limit = parseNullableNumber(
      body.usageLimit,
      "Giới hạn lượt dùng"
    );
  }

  if (body.startDate !== undefined) {
    data.start_date = parseNullableDate(body.startDate, "Ngày bắt đầu");
  }

  if (body.endDate !== undefined) {
    data.end_date = parseNullableDate(body.endDate, "Ngày kết thúc");
  }

  if (body.isActive !== undefined) {
    data.is_active = body.isActive;
  }

  const finalStartDate =
    data.start_date !== undefined ? data.start_date : existedVoucher.start_date;

  const finalEndDate =
    data.end_date !== undefined ? data.end_date : existedVoucher.end_date;

  if (finalStartDate && finalEndDate && finalStartDate > finalEndDate) {
    throw new AdminVoucherServiceError(
      "Ngày bắt đầu không được lớn hơn ngày kết thúc",
      400
    );
  }

  const updatedVoucher = await prisma.vouchers.update({
    where: {
      voucher_id: voucherId,
    },
    data,
  });

  return mapAdminVoucherToDto(updatedVoucher);
};

/**
 * DELETE /api/admin/vouchers/:voucherId
 * Xóa mềm voucher bằng is_active=false.
 */
export const deleteAdminVoucherService = async (
  voucherId: number
): Promise<AdminVoucherDto> => {
  if (!voucherId || Number.isNaN(voucherId)) {
    throw new AdminVoucherServiceError("voucherId không hợp lệ", 400);
  }

  const existedVoucher = await prisma.vouchers.findUnique({
    where: {
      voucher_id: voucherId,
    },
  });

  if (!existedVoucher) {
    throw new AdminVoucherServiceError("Không tìm thấy voucher", 404);
  }

  const deletedVoucher = await prisma.vouchers.update({
    where: {
      voucher_id: voucherId,
    },
    data: {
      is_active: false,
    },
  });

  return mapAdminVoucherToDto(deletedVoucher);
};