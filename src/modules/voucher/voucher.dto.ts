// src/modules/voucher/voucher.dto.ts


export type VoucherDto = {
    voucherId: number;
    code: string;
    discountType: string;
    discountValue: number;
    minOrderValue: number | null;
    maxDiscountAmount: number | null;
    usageLimit: number | null;
    usedCount: number;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
  };
  
  export type ValidateVoucherBody = {
    code: string;
    subTotal: number;
  };
  
  export type ValidateVoucherResultDto = {
    voucher: VoucherDto;
    subTotal: number;
    discountAmount: number;
    totalAfterDiscount: number;
  };