// src/modules/order/order.dto.ts 

export type CheckoutBody = {
  addressId: number;
  voucherCode?: string;
  paymentMethod?: "COD" | "OnlineBanking";
};
  
  export type CustomerOrderItemDto = {
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
  
  export type CustomerOrderDto = {
    orderId: number;
    orderCode: string;
    orderStatus: string;
  
    customerName: string | null;
    customerPhone: string | null;
    shippingAddress: string | null;
  
    subTotal: number;
    shippingFee: number;
    discountAmount: number;
    totalAmount: number;
  
    createdAt: string;
    updatedAt: string;
  
    items: CustomerOrderItemDto[];
  };
  
  export type CustomerOrderListResponseDto = {
    items: CustomerOrderDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };

  export type CustomerOrderStatus =
    | "PendingPayment"
    | "PendingConfirmation"
    | "Confirmed"
    | "Processing"
    | "Shipping"
    | "Completed"
    | "Cancelled";

  export type CustomerOrderSort =
    | "newest"
    | "oldest"
    | "total_asc"
    | "total_desc";

  export type CustomerOrderListQuery = {
    page: number;
    limit: number;
    status?: CustomerOrderStatus;
    sort: CustomerOrderSort;
  };

  export type PaymentMethod = "COD" | "OnlineBanking";
