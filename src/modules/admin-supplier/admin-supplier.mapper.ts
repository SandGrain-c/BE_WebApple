// src/modules/admin-supplier/admin-supplier.mapper.ts

import type { SupplierDto } from "./admin-supplier.dto";

// Mapper: hàm chuyển dữ liệu DB sang dữ liệu trả về FE
export function mapSupplierToDto(supplier: any): SupplierDto {
  return {
    supplierId: supplier.supplier_id,
    supplierName: supplier.supplier_name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    status: supplier.status,
    createdAt: supplier.created_at?.toISOString?.() ?? String(supplier.created_at),
    totalInventoryReceipts: supplier._count?.inventory_receipts,
  };
}