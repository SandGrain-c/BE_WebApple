// src/modules/payment-transaction/payment-transaction.dto.ts

export type PaymentType = "Payment" | "Refund";

export type PaymentStatus = "Pending" | "Success" | "Failed" | "Cancelled";

export type PaymentGateway =
  | "COD"
  | "BankTransfer"
  | "VNPay"
  | "MoMo"
  | "Manual"
  | string;

export type PaymentOrderSummaryDto = {
  orderId: number;
  orderCode: string;
  orderStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  totalAmount: number;
  createdAt: string;
};

export type PaymentTransactionDto = {
  transactionId: number;
  orderId: number;
  gateway: string | null;
  transactionRef: string | null;
  amount: number;
  paymentType: string;
  status: string;
  gatewayResponse: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  order?: PaymentOrderSummaryDto;
};

export type AdminPaymentTransactionListQueryDto = {
  search?: string;
  orderId?: number;
  gateway?: string;
  paymentType?: PaymentType;
  status?: PaymentStatus;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "amount_asc" | "amount_desc";
};

export type CreatePaymentTransactionDto = {
  orderId: number;
  gateway?: PaymentGateway;
  transactionRef?: string;
  amount: number;
  paymentType?: PaymentType;
  status?: PaymentStatus;
  gatewayResponse?: unknown;
  paidAt?: string;
};

export type UpdatePaymentTransactionStatusDto = {
  status: PaymentStatus;
  gatewayResponse?: unknown;
  paidAt?: string;
};