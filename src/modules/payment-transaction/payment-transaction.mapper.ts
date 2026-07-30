// src/modules/payment-transaction/payment-transaction.mapper.ts

import type {
    CustomerPaymentTransactionDto,
    PaymentOrderSummaryDto,
    PaymentTransactionDto,
  } from "./payment-transaction.dto";
  
  function toNumber(value: any) {
    // Prisma Decimal cần ép về number để FE dùng dễ hơn
    if (value === null || value === undefined) return 0;
    return Number(value);
  }
  
  function toIsoString(value: any) {
    if (!value) return null;
    return value?.toISOString?.() ?? String(value);
  }
  
  export function mapPaymentOrderToDto(order: any): PaymentOrderSummaryDto {
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      totalAmount: toNumber(order.total_amount),
      createdAt: toIsoString(order.created_at) ?? "",
    };
  }
  
  export function mapPaymentTransactionToDto(
    transaction: any
  ): PaymentTransactionDto {
    return {
      transactionId: transaction.transaction_id,
      orderId: transaction.order_id,
      gateway: transaction.gateway,
      transactionRef: transaction.transaction_ref,
      amount: toNumber(transaction.amount),
      paymentType: transaction.payment_type,
      status: transaction.status,
      gatewayResponse: transaction.gateway_response,
      paidAt: toIsoString(transaction.paid_at),
      createdAt: toIsoString(transaction.created_at) ?? "",
      updatedAt: toIsoString(transaction.updated_at),
      order: transaction.orders ? mapPaymentOrderToDto(transaction.orders) : undefined,
    };
  }

  export function mapCustomerPaymentTransactionToDto(
    transaction: unknown
  ): CustomerPaymentTransactionDto {
    const { gatewayResponse: _gatewayResponse, ...customerTransaction } =
      mapPaymentTransactionToDto(transaction);

    return customerTransaction;
  }
