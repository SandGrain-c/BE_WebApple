// src/modules/admin-supplier/admin-supplier.dto.ts

// DTO: Data Transfer Object - kiểu dữ liệu BE nhận/trả cho FE
export type SupplierStatus = "Active" | "Inactive";

export type SupplierDto = {
  supplierId: number;
  supplierName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: SupplierStatus | string;
  createdAt: string;
  totalInventoryReceipts?: number;
};

export type CreateSupplierDto = {
  supplierName: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: SupplierStatus;
};

export type UpdateSupplierDto = {
  supplierName?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status?: SupplierStatus;
};

export type SupplierListQueryDto = {
  search?: string;
  status?: SupplierStatus;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "name_asc" | "name_desc";
};

export type SupplierListResponseDto = {
  items: SupplierDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};