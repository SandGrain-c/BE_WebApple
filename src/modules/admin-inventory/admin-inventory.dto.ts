export type InventoryVariantDto = {
    variantId: number;
    productId: number;
    productName: string;
    productSlug: string;
  
    sku: string;
    variantName: string | null;
    color: string | null;
    capacity: string | null;
    ram: string | null;
    country: string | null;
  
    price: number;
    stockQuantity: number;
    stockStatus: "in-stock" | "low-stock" | "out-of-stock";
  
    totalProductItems: number;
    inStockItems: number;
  };
  
  export type InventoryVariantListResponseDto = {
    items: InventoryVariantDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetInventoryVariantsQuery = {
    search?: string;
    productId?: string;
    stockStatus?: string;
    lowStockThreshold?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type InventoryReceiptItemBody = {
    variantId: number;
    quantity: number;
    costPrice: number;
  
    /**
     * serialNumbers dùng cho hàng Apple nếu muốn quản lý từng máy.
     * Nếu gửi thì số lượng serial phải bằng quantity.
     */
    serialNumbers?: string[];
  };
  
  export type CreateInventoryReceiptBody = {
    supplierName?: string | null;
    supplierId?: number | null;
    items: InventoryReceiptItemBody[];
  };
  
  export type InventoryReceiptItemDto = {
    receiptDetailId: number;
    variantId: number;
    productId: number;
    productName: string;
    productSlug: string;
  
    sku: string;
    color: string | null;
    capacity: string | null;
    ram: string | null;
  
    quantity: number;
    costPrice: number;
    lineTotal: number;
  
    serialNumbers: string[];
  };
  
  export type InventoryReceiptDto = {
    receiptId: number;
    warehouseStaffId: number;
    warehouseStaffName: string | null;
    supplierId: number | null;
    supplierName: string | null;
    totalAmount: number;
    createdAt: string;
    items: InventoryReceiptItemDto[];
  };
  
  export type InventoryReceiptListItemDto = {
    receiptId: number;
    warehouseStaffId: number;
    warehouseStaffName: string | null;
    supplierId: number | null;
    supplierName: string | null;
    totalAmount: number;
    totalQuantity: number;
    createdAt: string;
  };
  
  export type InventoryReceiptListResponseDto = {
    items: InventoryReceiptListItemDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetInventoryReceiptsQuery = {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type AdjustStockBody = {
    /**
     * type:
     * set      = đặt lại tồn kho bằng quantity
     * increase = tăng tồn kho thêm quantity
     * decrease = giảm tồn kho đi quantity
     */
    type: "set" | "increase" | "decrease";
    quantity: number;
    reason?: string | null;
  };