import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { payOS, payOSConfig } from "../../config/payos";
import prisma from "../../utils/prisma";
import type {
  PayOSPaymentLinkDto,
  PayOSWebhookResponseDto,
} from "./payos-payment.dto";

type JsonRecord = Record<string, unknown>;
type PayOSWebhookInput = Parameters<typeof payOS.webhooks.verify>[0];
type VerifiedPayOSWebhookData = {
  orderCode: number;
  amount: number;
  currency: "VND";
  paymentLinkId: string;
  reference: string;
  code: string;
  description: string;
};
type GatewayOutcome = "Success" | "Failed" | "Cancelled" | "Pending";
type InitializationReservation = {
  token: string;
  startedAt: number;
};

const INITIALIZATION_RESERVATION_KEY =
  "__webapplePayOSInitializationReservation";
const INITIALIZATION_RESERVATION_TTL_MS = 30_000;
const INITIALIZATION_WAIT_TIMEOUT_MS = 15_000;
const INITIALIZATION_POLL_INTERVAL_MS = 25;

export class PayOSPaymentError extends Error {
  readonly statusCode: 400 | 404 | 409;

  constructor(message: string, statusCode: 400 | 404 | 409) {
    super(message);
    this.name = "PayOSPaymentError";
    this.statusCode = statusCode;
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const databaseDecimalToNumber = (value: unknown) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error("Database payment amount is not finite");
  }

  return amount;
};

const readNonEmptyString = (value: JsonRecord, key: string) => {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : null;
};

const parseGatewayResponse = (value: string | null) => {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getInitializationReservation = (
  gatewayResponse: JsonRecord | null,
): InitializationReservation | null => {
  const rawReservation = gatewayResponse?.[INITIALIZATION_RESERVATION_KEY];

  if (!isRecord(rawReservation)) {
    return null;
  }

  const token = rawReservation.token;
  const startedAt = rawReservation.startedAt;

  if (
    typeof token !== "string" ||
    !token ||
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt)
  ) {
    return null;
  }

  return { token, startedAt };
};

const createInitializationReservation = () => {
  const reservation: InitializationReservation = {
    token: randomUUID(),
    startedAt: Date.now(),
  };

  return {
    reservation,
    serialized: JSON.stringify({
      [INITIALIZATION_RESERVATION_KEY]: reservation,
    }),
  };
};

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

const validatePositiveInteger = (value: number, fieldName: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PayOSPaymentError(`${fieldName} không hợp lệ`, 400);
  }
};

function buildPayOSDescription(orderId: number) {
  return `DH${orderId}`;
}

function buildReturnUrl(orderId: number) {
  return `${payOSConfig.returnUrl}?orderId=${orderId}`;
}

function buildCancelUrl(orderId: number) {
  return `${payOSConfig.cancelUrl}?orderId=${orderId}`;
}

function mapPaymentLinkToDto(
  order: {
    order_id: number;
    order_code: string;
    total_amount: unknown;
  },
  paymentLink: unknown,
): PayOSPaymentLinkDto {
  const link = isRecord(paymentLink) ? paymentLink : {};

  return {
    orderId: order.order_id,
    orderCode: order.order_code,
    amount: databaseDecimalToNumber(order.total_amount),
    paymentLinkId: readNonEmptyString(link, "paymentLinkId"),
    checkoutUrl: readNonEmptyString(link, "checkoutUrl"),
    qrCode: readNonEmptyString(link, "qrCode"),
    status: readNonEmptyString(link, "status") ?? "PENDING",
  };
}

async function writeAuditLog(params: {
  tx: Prisma.TransactionClient;
  actorId?: number | null;
  action: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}) {
  await params.tx.audit_logs.create({
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

const loadOwnedPayOSOrder = (orderId: number, userId: number) =>
  prisma.orders.findFirst({
    where: {
      order_id: orderId,
      user_id: userId,
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
          created_at: "desc" as const,
        },
      },
    },
  });

const getEligiblePayOSOrder = (
  loadedOrder: Awaited<ReturnType<typeof loadOwnedPayOSOrder>>,
) => {
  if (!loadedOrder) {
    throw new PayOSPaymentError("Không tìm thấy đơn hàng", 404);
  }

  if (loadedOrder.order_status !== "PendingPayment") {
    throw new PayOSPaymentError(
      "Chỉ tạo QR PayOS cho đơn hàng đang chờ thanh toán",
      400,
    );
  }

  const payment = loadedOrder.payment_transactions[0];

  if (!payment) {
    throw new PayOSPaymentError(
      "Đơn hàng chưa có giao dịch thanh toán PayOS",
      400,
    );
  }

  if (payment.status === "Success") {
    throw new PayOSPaymentError("Đơn hàng đã thanh toán thành công", 400);
  }

  return {
    order: loadedOrder,
    payment,
  };
};

export async function createPayOSPaymentLinkForOrder(
  orderId: number,
  userId?: number,
): Promise<PayOSPaymentLinkDto> {
  validatePositiveInteger(orderId, "orderId");

  if (!userId) {
    throw new PayOSPaymentError("Bạn chưa đăng nhập", 400);
  }

  validatePositiveInteger(userId, "userId");
  const waitDeadline = Date.now() + INITIALIZATION_WAIT_TIMEOUT_MS;

  while (Date.now() <= waitDeadline) {
    const loadedOrder = await loadOwnedPayOSOrder(orderId, userId);
    const { order, payment } = getEligiblePayOSOrder(loadedOrder);
    const oldGatewayResponse = parseGatewayResponse(payment.gateway_response);

    if (readNonEmptyString(oldGatewayResponse ?? {}, "checkoutUrl")) {
      return mapPaymentLinkToDto(order, oldGatewayResponse);
    }

    const existingReservation =
      getInitializationReservation(oldGatewayResponse);
    const reservationIsCurrent =
      existingReservation &&
      Date.now() - existingReservation.startedAt <
        INITIALIZATION_RESERVATION_TTL_MS;

    if (reservationIsCurrent) {
      await wait(INITIALIZATION_POLL_INTERVAL_MS);
      continue;
    }

    const { serialized: reservationPayload } =
      createInitializationReservation();
    const claimed = await prisma.payment_transactions.updateMany({
      where: {
        transaction_id: payment.transaction_id,
        status: {
          not: "Success",
        },
        gateway_response: payment.gateway_response,
      },
      data: {
        gateway_response: reservationPayload,
      },
    });

    if (claimed.count !== 1) {
      await wait(INITIALIZATION_POLL_INTERVAL_MS);
      continue;
    }

    try {
      const amount = Math.round(
        databaseDecimalToNumber(order.total_amount),
      );

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new PayOSPaymentError(
          "Số tiền thanh toán không hợp lệ",
          400,
        );
      }

      const items = order.order_details.map((detail) => ({
        name:
          detail.product_variants?.variant_name ||
          detail.product_variants?.products?.name ||
          "Sản phẩm Apple",
        quantity: detail.quantity,
        price: Math.round(
          databaseDecimalToNumber(detail.unit_price),
        ),
      }));

      const paymentLink = await payOS.paymentRequests.create({
        orderCode: order.order_id,
        amount,
        description: buildPayOSDescription(order.order_id),
        items,
        buyerName: order.customer_name ?? undefined,
        buyerPhone: order.customer_phone ?? undefined,
        cancelUrl: buildCancelUrl(order.order_id),
        returnUrl: buildReturnUrl(order.order_id),
      });
      const serializedPaymentLink = JSON.stringify(paymentLink);

      if (!serializedPaymentLink) {
        throw new Error("PayOS returned an invalid payment link response");
      }

      const paymentLinkRecord = isRecord(paymentLink) ? paymentLink : {};
      const transactionRef =
        readNonEmptyString(paymentLinkRecord, "paymentLinkId") ??
        String(order.order_id);
      const finalized = await prisma.payment_transactions.updateMany({
        where: {
          transaction_id: payment.transaction_id,
          gateway_response: reservationPayload,
          status: {
            not: "Success",
          },
        },
        data: {
          transaction_ref: transactionRef,
          gateway_response: serializedPaymentLink,
          updated_at: new Date(),
        },
      });

      if (finalized.count !== 1) {
        throw new Error("PayOS initialization reservation was lost");
      }

      return mapPaymentLinkToDto(order, paymentLink);
    } catch (error) {
      await prisma.payment_transactions.updateMany({
        where: {
          transaction_id: payment.transaction_id,
          gateway_response: reservationPayload,
        },
        data: {
          gateway_response: payment.gateway_response,
        },
      });

      throw error;
    }
  }

  throw new PayOSPaymentError(
    "Giao dịch đang được khởi tạo, vui lòng thử lại",
    409,
  );
}

const parseWebhookEnvelope = (value: unknown) => {
  if (!isRecord(value)) {
    throw new PayOSPaymentError("Webhook PayOS không hợp lệ", 400);
  }

  if (!readNonEmptyString(value, "signature") || !isRecord(value.data)) {
    throw new PayOSPaymentError("Webhook PayOS không hợp lệ", 400);
  }

  return value as PayOSWebhookInput;
};

const parseVerifiedWebhookData = (
  value: unknown,
): VerifiedPayOSWebhookData => {
  if (!isRecord(value)) {
    throw new PayOSPaymentError("Dữ liệu webhook PayOS không hợp lệ", 400);
  }

  const {
    orderCode,
    amount,
    currency,
    paymentLinkId,
    reference,
    code,
    desc,
  } = value;

  if (
    typeof orderCode !== "number" ||
    !Number.isSafeInteger(orderCode) ||
    orderCode <= 0
  ) {
    throw new PayOSPaymentError("Webhook PayOS thiếu orderCode", 400);
  }

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new PayOSPaymentError("Số tiền PayOS không hợp lệ", 400);
  }

  if (currency !== "VND") {
    throw new PayOSPaymentError("Đơn vị tiền tệ PayOS không hợp lệ", 400);
  }

  if (typeof paymentLinkId !== "string" || !paymentLinkId.trim()) {
    throw new PayOSPaymentError("PayOS paymentLinkId không hợp lệ", 400);
  }

  if (typeof reference !== "string" || !reference.trim()) {
    throw new PayOSPaymentError("Mã tham chiếu PayOS không hợp lệ", 400);
  }

  if (typeof code !== "string" || !code.trim()) {
    throw new PayOSPaymentError("Trạng thái PayOS không hợp lệ", 400);
  }

  return {
    orderCode,
    amount,
    currency,
    paymentLinkId: paymentLinkId.trim(),
    reference: reference.trim(),
    code: code.trim(),
    description: typeof desc === "string" ? desc.trim() : "",
  };
};

const mapGatewayOutcome = (
  webhookData: VerifiedPayOSWebhookData,
): GatewayOutcome => {
  const code = webhookData.code.toUpperCase();
  const description = webhookData.description.toLocaleLowerCase("vi");

  if (code === "00") {
    return "Success";
  }

  if (
    code === "CANCELLED" ||
    code === "CANCELED" ||
    description.includes("hủy") ||
    description.includes("cancel")
  ) {
    return "Cancelled";
  }

  if (code === "PENDING" || description.includes("pending")) {
    return "Pending";
  }

  return "Failed";
};

const idempotentWebhookResponse = (
  orderId: number,
  transactionId: number,
): PayOSWebhookResponseDto => ({
  received: true,
  orderId,
  transactionId,
  message: "Webhook đã được xử lý trước đó",
});

export async function handlePayOSWebhook(
  payload: unknown,
  ipAddress?: string,
): Promise<PayOSWebhookResponseDto> {
  const webhookPayload = parseWebhookEnvelope(payload);
  let verifiedValue: unknown;

  try {
    verifiedValue = await payOS.webhooks.verify(webhookPayload);
  } catch {
    throw new PayOSPaymentError("Webhook PayOS không hợp lệ", 400);
  }

  const webhookData = parseVerifiedWebhookData(verifiedValue);
  const gatewayOutcome = mapGatewayOutcome(webhookData);
  const serializedPayload = JSON.stringify(payload);

  if (!serializedPayload) {
    throw new PayOSPaymentError("Webhook PayOS không hợp lệ", 400);
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.orders.findUnique({
      where: {
        order_id: webhookData.orderCode,
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
      throw new PayOSPaymentError(
        "Không tìm thấy đơn hàng từ webhook PayOS",
        400,
      );
    }

    const transaction = order.payment_transactions[0];

    if (!transaction) {
      throw new PayOSPaymentError(
        "Không tìm thấy giao dịch PayOS của đơn hàng",
        400,
      );
    }

    const orderAmount = Math.round(
      databaseDecimalToNumber(order.total_amount),
    );
    const paymentAmount = Math.round(
      databaseDecimalToNumber(transaction.amount),
    );

    if (
      webhookData.amount !== orderAmount ||
      webhookData.amount !== paymentAmount
    ) {
      throw new PayOSPaymentError(
        "Số tiền PayOS webhook không khớp với giao dịch",
        400,
      );
    }

    if (
      transaction.transaction_ref !== null &&
      transaction.transaction_ref !== webhookData.paymentLinkId
    ) {
      throw new PayOSPaymentError(
        "Mã tham chiếu PayOS không khớp với giao dịch",
        400,
      );
    }

    if (transaction.status === "Success") {
      return idempotentWebhookResponse(
        order.order_id,
        transaction.transaction_id,
      );
    }

    if (gatewayOutcome !== "Success") {
      const updated = await tx.payment_transactions.updateMany({
        where: {
          transaction_id: transaction.transaction_id,
          status: transaction.status,
        },
        data: {
          status: gatewayOutcome,
          paid_at: null,
          gateway_response: serializedPayload,
          updated_at: new Date(),
        },
      });

      if (updated.count === 0) {
        const current = await tx.payment_transactions.findUnique({
          where: {
            transaction_id: transaction.transaction_id,
          },
          select: {
            status: true,
          },
        });

        if (current?.status === "Success") {
          return idempotentWebhookResponse(
            order.order_id,
            transaction.transaction_id,
          );
        }
      }

      return {
        received: true,
        orderId: order.order_id,
        transactionId: transaction.transaction_id,
        message: "Xử lý webhook PayOS thành công",
      };
    }

    if (order.order_status === "Cancelled") {
      throw new PayOSPaymentError(
        "Không thể thanh toán đơn hàng đã hủy",
        400,
      );
    }

    if (order.order_status !== "PendingPayment") {
      throw new PayOSPaymentError(
        "Trạng thái đơn hàng không cho phép thanh toán",
        400,
      );
    }

    const paidAt = new Date();
    const claimedPayment = await tx.payment_transactions.updateMany({
      where: {
        transaction_id: transaction.transaction_id,
        status: {
          not: "Success",
        },
      },
      data: {
        status: "Success",
        paid_at: paidAt,
        gateway_response: serializedPayload,
        updated_at: paidAt,
      },
    });

    if (claimedPayment.count === 0) {
      return idempotentWebhookResponse(
        order.order_id,
        transaction.transaction_id,
      );
    }

    const claimedOrder = await tx.orders.updateMany({
      where: {
        order_id: order.order_id,
        order_status: "PendingPayment",
      },
      data: {
        order_status: "PendingConfirmation",
        updated_at: paidAt,
      },
    });

    if (claimedOrder.count !== 1) {
      throw new PayOSPaymentError(
        "Trạng thái đơn hàng không cho phép thanh toán",
        400,
      );
    }

    await tx.order_status_history.create({
      data: {
        order_id: order.order_id,
        old_status: "PendingPayment",
        new_status: "PendingConfirmation",
        changed_by: null,
        note: "PayOS xác nhận thanh toán thành công",
      },
    });

    const updatedTransaction =
      await tx.payment_transactions.findUniqueOrThrow({
        where: {
          transaction_id: transaction.transaction_id,
        },
      });

    await writeAuditLog({
      tx,
      actorId: null,
      action: "PAYOS_WEBHOOK_PAYMENT_SUCCESS",
      entityId: transaction.transaction_id,
      oldValue: transaction,
      newValue: updatedTransaction,
      ipAddress,
    });

    return {
      received: true,
      orderId: order.order_id,
      transactionId: transaction.transaction_id,
      message: "Xử lý webhook PayOS thành công",
    };
  });
}

export async function getPayOSPaymentStatus(
  orderId: number,
  userId: number,
) {
  validatePositiveInteger(orderId, "orderId");
  validatePositiveInteger(userId, "userId");

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
    throw new PayOSPaymentError("Không tìm thấy đơn hàng", 404);
  }

  const transaction = order.payment_transactions[0];

  return {
    orderId: order.order_id,
    orderCode: order.order_code,
    orderStatus: order.order_status,
    paymentStatus: transaction?.status ?? null,
    amount: databaseDecimalToNumber(order.total_amount),
    paidAt: transaction?.paid_at?.toISOString() ?? null,
  };
}
