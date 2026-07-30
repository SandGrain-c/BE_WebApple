import { VoucherDto } from "./voucher.dto";

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const toISOStringOrNull = (value: any): string | null => {
  if (!value) return null;
  return value?.toISOString?.() ?? String(value);
};

export const mapVoucherToDto = (voucher: any): VoucherDto => {
  return {
    voucherId: voucher.voucher_id,
    code: voucher.code,
    discountType: voucher.discount_type,
    discountValue: toNumber(voucher.discount_value),
    minOrderValue:
      voucher.min_order_value === null ? null : toNumber(voucher.min_order_value),
    maxDiscountAmount:
      voucher.max_discount_amount === null
        ? null
        : toNumber(voucher.max_discount_amount),
    usageLimit: voucher.usage_limit,
    usedCount: voucher.used_count,
    startDate: toISOStringOrNull(voucher.start_date),
    endDate: toISOStringOrNull(voucher.end_date),
    isActive: voucher.is_active,
  };
};