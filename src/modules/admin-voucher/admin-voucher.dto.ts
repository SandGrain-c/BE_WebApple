export type AdminVoucherDto = {
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
  
  export type AdminVoucherListResponseDto = {
    items: AdminVoucherDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminVouchersQuery = {
    search?: string;
    isActive?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type CreateAdminVoucherBody = {
    code: string;
    discountType: "Percent" | "Fixed";
    discountValue: number;
    minOrderValue?: number | null;
    maxDiscountAmount?: number | null;
    usageLimit?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    isActive?: boolean;
  };
  
  export type UpdateAdminVoucherBody = Partial<CreateAdminVoucherBody>;