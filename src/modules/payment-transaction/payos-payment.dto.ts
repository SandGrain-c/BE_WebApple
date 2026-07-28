// src/modules/payment-transaction/payos-payment.dto.ts

export type PayOSPaymentLinkDto = {
    orderId: number;
    orderCode: string;
    amount: number;
    paymentLinkId: string | null;
    checkoutUrl: string | null;
    qrCode: string | null;
    status: string;
  };
  
  export type PayOSWebhookResponseDto = {
    received: boolean;
    orderId?: number;
    transactionId?: number;
    message: string;
  };