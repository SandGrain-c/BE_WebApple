// src/modules/payment-transaction/payos-payment.service.ts

import prisma from "../../utils/prisma";
import { payOS, payOSConfig } from "../../config/payos";
import type {
  PayOSPaymentLinkDto,
  PayOSWebhookResponseDto,
} from "./payos-payment.dto";

function toNumber(value: any) {
  return Number(value || 0);
}

function parseGatewayResponse(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildPayOSDescription(orderId: number) {
  // PayOS lưu ý description có thể bị giới hạn ký tự trong một số trường hợp.
  // Dùng mã ngắn để an toàn khi tạo VietQR.
  return `DH${orderId}`;
}

function buildReturnUrl(orderId: number) {
  return `${payOSConfig.returnUrl}?orderId=${orderId}`;
}

function buildCancelUrl(orderId: number) {
  return `${payOSConfig.cancelUrl}?orderId=${orderId}`;
}

function mapPaymentLinkToDto(
    order: any,
    paymentLink: any
  ): PayOSPaymentLinkDto {
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
      amount: toNumber(order.total_amount),
  
      // PayOS SDK trả trực tiếp các field này, không bọc trong data
      paymentLinkId: paymentLink?.paymentLinkId ?? null,
      checkoutUrl: paymentLink?.checkoutUrl ?? null,
      qrCode: paymentLink?.qrCode ?? null,
      status: paymentLink?.status ?? "PENDING",
    };
  }

async function writeAuditLog(params: {
  tx?: any;
  actorId?: number | null;
  action: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}) {
  const client = params.tx ?? prisma;

  await client.audit_logs.create({
    data: {
      user_id: params.actorId ?? null,
      action: params.action,
      entity_type: "payment_transactions",
      entity_id: params.entityId,
      old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
      new_value: params.newValue ? JSON.stringify(params.newValue) : null,
      ip_address: params.ipAddress,
    },
  });
}

export async function createPayOSPaymentLinkForOrder(
  orderId: number,
  userId?: number
): Promise<PayOSPaymentLinkDto> {
  if (!orderId || orderId <= 0) {
    throw new Error("orderId không hợp lệ");
  }

  const order = await prisma.orders.findFirst({
    where: {
      order_id: orderId,
      ...(userId ? { user_id: userId } : {}),
    },
    include: {
      order_details: {
        include: {
          product_variants: {
            include: {
              products: true,
            },
          },
        },
      },
      payment_transactions: {
        where: {
          gateway: "payOS",
          payment_type: "Payment",
        },
        orderBy: {
          created_at: "desc",
        },
      },
    },
  });

  if (!order) {
    throw new Error("Không tìm thấy đơn hàng");
  }

  if (order.order_status !== "PendingPayment") {
    throw new Error("Chỉ tạo QR PayOS cho đơn hàng đang chờ thanh toán");
  }

  const existedTransaction = order.payment_transactions[0];

  if (!existedTransaction) {
    throw new Error("Đơn hàng chưa có giao dịch thanh toán PayOS");
  }

  if (existedTransaction.status === "Success") {
    throw new Error("Đơn hàng đã thanh toán thành công");
  }

  const oldGatewayResponse = parseGatewayResponse(
    existedTransaction.gateway_response
  );

  // Nếu trước đó đã tạo QR rồi thì trả lại, tránh gọi PayOS tạo trùng orderCode
  if (oldGatewayResponse?.checkoutUrl) {
    return mapPaymentLinkToDto(order, oldGatewayResponse);
  }

  const amount = Math.round(toNumber(order.total_amount));

  if (amount <= 0) {
    throw new Error("Số tiền thanh toán không hợp lệ");
  }

  const items = order.order_details.map((detail: any) => ({
    name:
      detail.product_variants?.variant_name ||
      detail.product_variants?.products?.name ||
      "Sản phẩm Apple",
    quantity: detail.quantity,
    price: Math.round(toNumber(detail.unit_price)),
  }));

  const paymentData = {
    // PayOS yêu cầu orderCode là integer, nên dùng order_id
    orderCode: order.order_id,
    amount,
    description: buildPayOSDescription(order.order_id),
    items,
    buyerName: order.customer_name ?? undefined,
    buyerPhone: order.customer_phone ?? undefined,
    cancelUrl: buildCancelUrl(order.order_id),
    returnUrl: buildReturnUrl(order.order_id),
  };

  // Gọi PayOS tạo link thanh toán / QR
  const paymentLink = await payOS.paymentRequests.create(paymentData);

await prisma.payment_transactions.update({
  where: {
    transaction_id: existedTransaction.transaction_id,
  },
  data: {
    /**
     * transaction_ref: mã tham chiếu giao dịch.
     * PayOS trả paymentLinkId trực tiếp trên response.
     */
    transaction_ref: paymentLink.paymentLinkId ?? String(order.order_id),

    /**
     * gateway_response: lưu toàn bộ response PayOS để tra cứu/debug.
     */
    gateway_response: JSON.stringify(paymentLink),
    updated_at: new Date(),
  },
});

  return mapPaymentLinkToDto(order, paymentLink);
}

export async function handlePayOSWebhook(
  payload: any,
  ipAddress?: string
): Promise<PayOSWebhookResponseDto> {
  let verifiedData: any;

try {
  verifiedData = payOS.webhooks.verify(payload);
} catch (error) {
  console.error("PAYOS VERIFY ERROR:", error);
  throw new Error("Webhook PayOS không hợp lệ");
}

console.log("PAYOS VERIFIED DATA:", JSON.stringify(verifiedData, null, 2));

const webhookData =
  verifiedData?.orderCode
    ? verifiedData
    : verifiedData?.data
      ? verifiedData.data
      : payload?.data
        ? payload.data
        : payload;

const orderCode = Number(webhookData?.orderCode);
const paidAmount = Number(webhookData?.amount);

if (!orderCode || orderCode <= 0) {
  throw new Error("Webhook PayOS thiếu orderCode");
}

if (!paidAmount || paidAmount <= 0) {
  throw new Error("Webhook PayOS thiếu amount");
}

  const order = await prisma.orders.findUnique({
    where: {
      order_id: orderCode,
    },
    include: {
      payment_transactions: {
        where: {
          gateway: "payOS",
          payment_type: "Payment",
        },
        orderBy: {
          created_at: "desc",
        },
      },
    },
  });

  if (!order) {
    throw new Error("Không tìm thấy đơn hàng từ webhook PayOS");
  }

  const transaction = order.payment_transactions[0];

  if (!transaction) {
    throw new Error("Không tìm thấy giao dịch PayOS của đơn hàng");
  }

  if (transaction.status === "Success") {
    return {
      received: true,
      orderId: order.order_id,
      transactionId: transaction.transaction_id,
      message: "Webhook đã được xử lý trước đó",
    };
  }

  const orderAmount = Math.round(toNumber(order.total_amount));

  if (paidAmount !== orderAmount) {
    throw new Error("Số tiền PayOS webhook không khớp với đơn hàng");
  }

  await prisma.$transaction(async (tx) => {
    const updatedTransaction = await tx.payment_transactions.update({
      where: {
        transaction_id: transaction.transaction_id,
      },
      data: {
        status: "Success",
        paid_at: new Date(),
        gateway_response: JSON.stringify(payload),
        updated_at: new Date(),
      },
    });

    if (order.order_status === "PendingPayment") {
      await tx.orders.update({
        where: {
          order_id: order.order_id,
        },
        data: {
          order_status: "PendingConfirmation",
          updated_at: new Date(),
        },
      });

      await tx.order_status_history.create({
        data: {
          order_id: order.order_id,
          old_status: "PendingPayment",
          new_status: "PendingConfirmation",
          changed_by: null,
          note: "PayOS xác nhận thanh toán thành công",
        },
      });
    }

    await writeAuditLog({
      tx,
      actorId: null,
      action: "PAYOS_WEBHOOK_PAYMENT_SUCCESS",
      entityId: transaction.transaction_id,
      oldValue: transaction,
      newValue: updatedTransaction,
      ipAddress,
    });
  });

  return {
    received: true,
    orderId: order.order_id,
    transactionId: transaction.transaction_id,
    message: "Xử lý webhook PayOS thành công",
  };
}

export async function getPayOSPaymentStatus(orderId: number, userId: number) {
  if (!orderId || orderId <= 0) {
    throw new Error("orderId không hợp lệ");
  }

  const order = await prisma.orders.findFirst({
    where: {
      order_id: orderId,
      user_id: userId,
    },
    include: {
      payment_transactions: {
        where: {
          gateway: "payOS",
          payment_type: "Payment",
        },
        orderBy: {
          created_at: "desc",
        },
      },
    },
  });

  if (!order) {
    throw new Error("Không tìm thấy đơn hàng");
  }

  const transaction = order.payment_transactions[0];

  return {
    orderId: order.order_id,
    orderCode: order.order_code,
    orderStatus: order.order_status,
    paymentStatus: transaction?.status ?? null,
    amount: toNumber(order.total_amount),
    paidAt: transaction?.paid_at?.toISOString?.() ?? null,
  };
}