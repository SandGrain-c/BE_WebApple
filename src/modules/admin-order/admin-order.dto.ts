// src/modules/admin-order/admin-order.dto.ts

export type AdminOrderItemDto = {
    orderDetailId: number;
    variantId: number;
    productId: number;
    productName: string;
    productSlug: string;
    sku: string;
    color: string | null;
    capacity: string | null;
    ram: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  };
  
  export type AdminOrderStatusHistoryDto = {
    historyId: number;
    oldStatus: string | null;
    newStatus: string;
    changedBy: number | null;
    changedByName: string | null;
    note: string | null;
    createdAt: string;
  };
  
  export type AdminOrderDto = {
    orderId: number;
    orderCode: string;
  
    userId: number | null;
    customerName: string | null;
    customerPhone: string | null;
    shippingAddress: string | null;
  
    subTotal: number;
    shippingFee: number;
    discountAmount: number;
    totalAmount: number;
  
    orderStatus: string;
    createdAt: string;
    updatedAt: string;
  
    items: AdminOrderItemDto[];
    statusHistory: AdminOrderStatusHistoryDto[];
  };
  
  export type AdminOrderListItemDto = {
    orderId: number;
    orderCode: string;
  
    userId: number | null;
    customerName: string | null;
    customerPhone: string | null;
    shippingAddress: string | null;
  
    subTotal: number;
    shippingFee: number;
    discountAmount: number;
    totalAmount: number;
  
    orderStatus: string;
    totalItems: number;
  
    createdAt: string;
    updatedAt: string;
  };
  
  export type AdminOrderListResponseDto = {
    items: AdminOrderListItemDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminOrdersQuery = {
    search?: string;
    status?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type UpdateAdminOrderStatusBody = {
    status: string;
    note?: string | null;
  };

  export type ExpirePendingPaymentsBody = {
    /**
     * Số phút sau khi tạo đơn mà chưa thanh toán thì coi là hết hạn.
     * Mặc định nên là 30 phút.
     */
    expireAfterMinutes?: number;
  
    /**
     * Giới hạn số đơn xử lý mỗi lần gọi API.
     * Tránh xử lý quá nhiều đơn trong một request.
     */
    limit?: number;
  };
  
  export type ExpirePendingPaymentsResultDto = {
    expireAfterMinutes: number;
    expiredOrderCount: number;
    expiredOrderIds: number[];
  };