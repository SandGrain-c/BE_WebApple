// src/modules/order/order.dto.ts 

export type CheckoutBody = {
  addressId: number;
  shippingFee?: number;
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
  };

  export type PaymentMethod = "COD" | "OnlineBanking";