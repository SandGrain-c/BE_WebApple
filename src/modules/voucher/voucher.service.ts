import prisma from "../../utils/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { ValidateVoucherBody, ValidateVoucherResultDto } from "./voucher.dto";
import { mapVoucherToDto } from "./voucher.mapper";

export class VoucherServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeCode = (code: unknown) => {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new VoucherServiceError("Vui lòng nhập mã giảm giá", 400);
  }

  return code.trim().toUpperCase();
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseValidateVoucherBody = (value: unknown): ValidateVoucherBody => {
  if (!isRecord(value)) {
    throw new VoucherServiceError("Dữ liệu voucher không hợp lệ", 400);
  }

  const code = normalizeCode(value.code);
  const subTotal = value.subTotal;

  if (
    typeof subTotal !== "number" ||
    !Number.isFinite(subTotal) ||
    subTotal < 0
  ) {
    throw new VoucherServiceError("Tổng tiền hàng không hợp lệ", 400);
  }

  return {
    code,
    subTotal,
  };
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const isPercentDiscount = (discountType: string) => {
  return ["Percent", "PERCENT", "percent", "Percentage"].includes(discountType);
};

const isFixedDiscount = (discountType: string) => {
  return ["Fixed", "FIXED", "fixed", "Amount", "AMOUNT"].includes(discountType);
};

/**
 * Tính số tiền giảm từ voucher.
 */
export const calculateVoucherDiscount = (voucher: any, subTotal: number) => {
  const discountType = voucher.discount_type;
  const discountValue = toNumber(voucher.discount_value);
  const maxDiscountAmount =
    voucher.max_discount_amount === null
      ? null
      : toNumber(voucher.max_discount_amount);

  let discountAmount = 0;

  if (isPercentDiscount(discountType)) {
    discountAmount = (subTotal * discountValue) / 100;
  } else if (isFixedDiscount(discountType)) {
    discountAmount = discountValue;
  } else {
    throw new VoucherServiceError("Loại giảm giá không hợp lệ", 400);
  }

  if (maxDiscountAmount !== null) {
    discountAmount = Math.min(discountAmount, maxDiscountAmount);
  }

  /**
   * Không cho giảm vượt quá tổng tiền hàng.
   */
  discountAmount = Math.min(discountAmount, subTotal);

  return Math.max(Math.floor(discountAmount), 0);
};

/**
 * validateVoucherForCheckout:
 * Hàm dùng chung cho:
 * - API kiểm tra voucher
 * - Checkout tạo đơn hàng
 *
 * tx là Prisma transaction client.
 */
export const validateVoucherForCheckout = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: number;
    code: unknown;
    subTotal: number;
  }
) => {
  const code = normalizeCode(params.code);

  if (!code) {
    throw new VoucherServiceError("Vui lòng nhập mã giảm giá", 400);
  }

  if (!params.userId || Number.isNaN(params.userId)) {
    throw new VoucherServiceError("Bạn chưa đăng nhập", 401);
  }

  if (Number.isNaN(params.subTotal) || params.subTotal <= 0) {
    throw new VoucherServiceError("Tổng tiền hàng không hợp lệ", 400);
  }

  const voucher = await tx.vouchers.findUnique({
    where: {
      code,
    },
  });

  if (!voucher) {
    throw new VoucherServiceError("Mã giảm giá không tồn tại", 404);
  }

  if (!voucher.is_active) {
    throw new VoucherServiceError("Mã giảm giá đã bị vô hiệu hóa", 400);
  }

  const now = new Date();

  if (voucher.start_date && voucher.start_date > now) {
    throw new VoucherServiceError("Mã giảm giá chưa đến thời gian sử dụng", 400);
  }

  if (voucher.end_date && voucher.end_date < now) {
    throw new VoucherServiceError("Mã giảm giá đã hết hạn", 400);
  }

  if (
    voucher.usage_limit !== null &&
    voucher.used_count >= voucher.usage_limit
  ) {
    throw new VoucherServiceError("Mã giảm giá đã hết lượt sử dụng", 400);
  }

  const minOrderValue =
    voucher.min_order_value === null ? 0 : toNumber(voucher.min_order_value);

  if (params.subTotal < minOrderValue) {
    throw new VoucherServiceError(
      `Đơn hàng chưa đạt giá trị tối thiểu ${minOrderValue}`,
      400
    );
  }

  const existedUsage = await tx.voucher_usages.findFirst({
    where: {
      voucher_id: voucher.voucher_id,
      user_id: params.userId,
    },
    select: {
      voucher_usage_id: true,
    },
  });

  if (existedUsage) {
    throw new VoucherServiceError("Bạn đã sử dụng mã giảm giá này rồi", 400);
  }

  const discountAmount = calculateVoucherDiscount(voucher, params.subTotal);

  return {
    voucher,
    discountAmount,
    totalAfterDiscount: params.subTotal - discountAmount,
  };
};

const getSelectedCartSubTotal = async (
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<number | null> => {
  const cart = await tx.carts.findUnique({
    where: {
      user_id: userId,
    },
    select: {
      cart_items: {
        where: {
          selected: true,
        },
        select: {
          quantity: true,
          product_variants: {
            select: {
              price: true,
              stock_quantity: true,
              products: {
                select: {
                  is_active: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.cart_items.length === 0) {
    return null;
  }

  let subTotal = 0;

  for (const item of cart.cart_items) {
    const variant = item.product_variants;

    if (!variant.products.is_active) {
      throw new VoucherServiceError(
        "Giỏ hàng có sản phẩm hiện không còn hoạt động",
        400,
      );
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new VoucherServiceError("Số lượng sản phẩm không hợp lệ", 400);
    }

    if (variant.stock_quantity < item.quantity) {
      throw new VoucherServiceError("Giỏ hàng có sản phẩm không đủ tồn kho", 400);
    }

    subTotal += Number(variant.price) * item.quantity;
  }

  return subTotal;
};

/**
 * GET /api/vouchers/available
 * Lấy voucher đang hoạt động.
 */
export const getAvailableVouchersService = async (
  userId: number,
  subTotal?: number
) => {
  if (!userId || Number.isNaN(userId)) {
    throw new VoucherServiceError("Bạn chưa đăng nhập", 401);
  }

  const now = new Date();

  const vouchers = await prisma.vouchers.findMany({
    where: {
      is_active: true,
      OR: [
        {
          start_date: null,
        },
        {
          start_date: {
            lte: now,
          },
        },
      ],
      AND: [
        {
          OR: [
            {
              end_date: null,
            },
            {
              end_date: {
                gte: now,
              },
            },
          ],
        },
      ],
    },
    orderBy: {
      voucher_id: "desc",
    },
  });

  const result = [];

  for (const voucher of vouchers) {
    const alreadyUsed = await prisma.voucher_usages.findFirst({
      where: {
        voucher_id: voucher.voucher_id,
        user_id: userId,
      },
      select: {
        voucher_usage_id: true,
      },
    });

    if (alreadyUsed) continue;

    if (
      voucher.usage_limit !== null &&
      voucher.used_count >= voucher.usage_limit
    ) {
      continue;
    }

    if (subTotal !== undefined && !Number.isNaN(subTotal)) {
      const minOrderValue =
        voucher.min_order_value === null ? 0 : Number(voucher.min_order_value);

      if (subTotal < minOrderValue) continue;
    }

    result.push(mapVoucherToDto(voucher));
  }

  return result;
};

/**
 * POST /api/vouchers/validate
 * Kiểm tra mã giảm giá.
 */
export const validateVoucherService = async (
  userId: number,
  body: unknown
): Promise<ValidateVoucherResultDto> => {
  const parsedBody = parseValidateVoucherBody(body);

  const result = await prisma.$transaction(async (tx) => {
    const selectedCartSubTotal = await getSelectedCartSubTotal(tx, userId);
    const subTotal = selectedCartSubTotal ?? parsedBody.subTotal;
    const voucherResult = await validateVoucherForCheckout(tx, {
      userId,
      code: parsedBody.code,
      subTotal,
    });

    return {
      ...voucherResult,
      subTotal,
    };
  });

  return {
    voucher: mapVoucherToDto(result.voucher),
    subTotal: result.subTotal,
    discountAmount: result.discountAmount,
    totalAfterDiscount: result.totalAfterDiscount,
  };
};
