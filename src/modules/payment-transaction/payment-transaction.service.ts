// src/modules/payment-transaction/payment-transaction.service.ts

import prisma from "../../utils/prisma";
import type {
  AdminPaymentTransactionListQueryDto,
  CreatePaymentTransactionDto,
  PaymentStatus,
  PaymentType,
  UpdatePaymentTransactionStatusDto,
} from "./payment-transaction.dto";
import { mapPaymentTransactionToDto } from "./payment-transaction.mapper";

const PAYMENT_TYPES: PaymentType[] = ["Payment", "Refund"];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "Pending",
  "Success",
  "Failed",
  "Cancelled",
];

export class CustomerPaymentAccessError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeText(value?: string | null) {
  // Chuẩn hóa chuỗi: bỏ khoảng trắng thừa
  return value?.trim() || null;
}

function normalizeJson(value: unknown) {
  // gatewayResponse có thể là object hoặc string
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function validatePositiveId(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} không hợp lệ`);
  }
}

function validateAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền giao dịch phải lớn hơn 0");
  }
}

function validatePaymentType(paymentType?: string): asserts paymentType is PaymentType {
  if (!paymentType || !PAYMENT_TYPES.includes(paymentType as PaymentType)) {
    throw new Error("Loại giao dịch thanh toán không hợp lệ");
  }
}

function validatePaymentStatus(status?: string): asserts status is PaymentStatus {
  if (!status || !PAYMENT_STATUSES.includes(status as PaymentStatus)) {
    throw new Error("Trạng thái giao dịch thanh toán không hợp lệ");
  }
}

function parsePaidAt(value?: string) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("paidAt không hợp lệ");
  }

  return date;
}

function getPaymentInclude() {
  return {
    orders: {
      select: {
        order_id: true,
        order_code: true,
        order_status: true,
        customer_name: true,
        customer_phone: true,
        total_amount: true,
        created_at: true,
      },
    },
  };
}

async function writeAuditLog(params: {
  tx?: any;
  actorId?: number;
  action: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}) {
  // Audit log: nhật ký thao tác admin
  const client = params.tx ?? prisma;

  await client.audit_logs.create({
    data: {
      user_id: params.actorId,
      action: params.action,
      entity_type: "payment_transactions",
      entity_id: params.entityId,
      old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
      new_value: params.newValue ? JSON.stringify(params.newValue) : null,
      ip_address: params.ipAddress,
    },
  });
}

async function syncOrderAfterSuccessfulPayment(params: {
  tx: any;
  order: any;
  actorId?: number;
  note: string;
}) {
  // Nếu đơn đang chờ thanh toán, thanh toán thành công thì chuyển sang chờ xác nhận
  if (params.order.order_status !== "PendingPayment") {
    return;
  }

  await params.tx.orders.update({
    where: {
      order_id: params.order.order_id,
    },
    data: {
      order_status: "PendingConfirmation",
      updated_at: new Date(),
    },
  });

  await params.tx.order_status_history.create({
    data: {
      order_id: params.order.order_id,
      old_status: params.order.order_status,
      new_status: "PendingConfirmation",
      changed_by: params.actorId,
      note: params.note,
    },
  });
}

export async function getAdminPaymentTransactions(
  query: AdminPaymentTransactionListQueryDto
) {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (query.orderId) {
    validatePositiveId(Number(query.orderId), "orderId");
    where.order_id = Number(query.orderId);
  }

  if (query.gateway?.trim()) {
    where.gateway = {
      equals: query.gateway.trim(),
      mode: "insensitive",
    };
  }

  if (query.paymentType) {
    validatePaymentType(query.paymentType);
    where.payment_type = query.paymentType;
  }

  if (query.status) {
    validatePaymentStatus(query.status);
    where.status = query.status;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();

    where.OR = [
      {
        transaction_ref: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        gateway: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        orders: {
          is: {
            OR: [
              {
                order_code: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                customer_name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                customer_phone: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
    ];
  }

  const orderBy =
    query.sort === "oldest"
      ? { created_at: "asc" as const }
      : query.sort === "amount_asc"
        ? { amount: "asc" as const }
        : query.sort === "amount_desc"
          ? { amount: "desc" as const }
          : { created_at: "desc" as const };

  const [items, totalItems] = await Promise.all([
    prisma.payment_transactions.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: getPaymentInclude(),
    }),
    prisma.payment_transactions.count({ where }),
  ]);

  return {
    items: items.map(mapPaymentTransactionToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getAdminPaymentTransactionById(transactionId: number) {
  validatePositiveId(transactionId, "transactionId");

  const transaction = await prisma.payment_transactions.findUnique({
    where: {
      transaction_id: transactionId,
    },
    include: getPaymentInclude(),
  });

  if (!transaction) {
    throw new Error("Không tìm thấy giao dịch thanh toán");
  }

  return mapPaymentTransactionToDto(transaction);
}

export async function createAdminPaymentTransaction(
  dto: CreatePaymentTransactionDto,
  actorId?: number,
  ipAddress?: string
) {
  const orderId = Number(dto.orderId);
  const amount = Number(dto.amount);
  const gateway = normalizeText(dto.gateway);
  const transactionRef = normalizeText(dto.transactionRef);
  const paymentType = dto.paymentType ?? "Payment";
  const status = dto.status ?? "Pending";
  const gatewayResponse = normalizeJson(dto.gatewayResponse);
  const paidAt = status === "Success" ? parsePaidAt(dto.paidAt) ?? new Date() : parsePaidAt(dto.paidAt);

  validatePositiveId(orderId, "orderId");
  validateAmount(amount);
  validatePaymentType(paymentType);
  validatePaymentStatus(status);

  const order = await prisma.orders.findUnique({
    where: {
      order_id: orderId,
    },
  });

  if (!order) {
    throw new Error("Không tìm thấy đơn hàng");
  }

  if (paymentType === "Payment" && amount > Number(order.total_amount)) {
    throw new Error("Số tiền thanh toán không được lớn hơn tổng tiền đơn hàng");
  }

  if (["Cancelled"].includes(order.order_status) && paymentType === "Payment") {
    throw new Error("Không thể tạo thanh toán cho đơn hàng đã hủy");
  }

  if (transactionRef) {
    const duplicatedTransaction = await prisma.payment_transactions.findFirst({
      where: {
        transaction_ref: transactionRef,
      },
    });

    if (duplicatedTransaction) {
      throw new Error("Mã giao dịch đã tồn tại");
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const transaction = await tx.payment_transactions.create({
      data: {
        order_id: orderId,
        gateway,
        transaction_ref: transactionRef,
        amount,
        payment_type: paymentType,
        status,
        gateway_response: gatewayResponse,
        paid_at: paidAt,
        updated_at: new Date(),
      },
    });

    if (paymentType === "Payment" && status === "Success") {
      await syncOrderAfterSuccessfulPayment({
        tx,
        order,
        actorId,
        note: "Thanh toán thành công",
      });
    }

    await writeAuditLog({
      tx,
      actorId,
      action: "CREATE_PAYMENT_TRANSACTION",
      entityId: transaction.transaction_id,
      newValue: transaction,
      ipAddress,
    });

    return transaction;
  });

  return getAdminPaymentTransactionById(created.transaction_id);
}

export async function updateAdminPaymentTransactionStatus(
  transactionId: number,
  dto: UpdatePaymentTransactionStatusDto,
  actorId?: number,
  ipAddress?: string
) {
  validatePositiveId(transactionId, "transactionId");
  validatePaymentStatus(dto.status);

  const currentTransaction = await prisma.payment_transactions.findUnique({
    where: {
      transaction_id: transactionId,
    },
    include: {
      orders: true,
    },
  });

  if (!currentTransaction) {
    throw new Error("Không tìm thấy giao dịch thanh toán");
  }

  if (["Success", "Cancelled"].includes(currentTransaction.status)) {
    throw new Error("Không thể cập nhật giao dịch đã thành công hoặc đã hủy");
  }

  if (currentTransaction.status === dto.status) {
    throw new Error("Trạng thái giao dịch không thay đổi");
  }

  const gatewayResponse = normalizeJson(dto.gatewayResponse);
  const paidAt =
    dto.status === "Success"
      ? parsePaidAt(dto.paidAt) ?? new Date()
      : parsePaidAt(dto.paidAt);

  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await tx.payment_transactions.update({
      where: {
        transaction_id: transactionId,
      },
      data: {
        status: dto.status,
        gateway_response: gatewayResponse ?? currentTransaction.gateway_response,
        paid_at: paidAt ?? currentTransaction.paid_at,
        updated_at: new Date(),
      },
    });

    if (
      currentTransaction.payment_type === "Payment" &&
      dto.status === "Success"
    ) {
      await syncOrderAfterSuccessfulPayment({
        tx,
        order: currentTransaction.orders,
        actorId,
        note: "Cập nhật giao dịch thanh toán thành công",
      });
    }

    await writeAuditLog({
      tx,
      actorId,
      action: "UPDATE_PAYMENT_TRANSACTION_STATUS",
      entityId: transactionId,
      oldValue: currentTransaction,
      newValue: transaction,
      ipAddress,
    });

    return transaction;
  });

  return getAdminPaymentTransactionById(updated.transaction_id);
}

export async function getCustomerPaymentTransactionsByOrderId(
  orderId: number,
  userId: number
) {
  validatePositiveId(orderId, "orderId");
  validatePositiveId(userId, "userId");

  const ownedOrder = await prisma.orders.findFirst({
    where: {
      order_id: orderId,
      user_id: userId,
    },
    select: {
      order_id: true,
    },
  });

  if (!ownedOrder) {
    throw new CustomerPaymentAccessError(
      "Không tìm thấy đơn hàng",
      404,
    );
  }

  const transactions = await prisma.payment_transactions.findMany({
    where: {
      order_id: ownedOrder.order_id,
      orders: {
        is: {
          user_id: userId,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    include: getPaymentInclude(),
  });

  return transactions.map(mapPaymentTransactionToDto);
}

export async function getCustomerPaymentTransactionById(
  transactionId: number,
  userId: number
) {
  validatePositiveId(transactionId, "transactionId");
  validatePositiveId(userId, "userId");

  const transaction = await prisma.payment_transactions.findFirst({
    where: {
      transaction_id: transactionId,
      orders: {
        is: {
          user_id: userId,
        },
      },
    },
    include: getPaymentInclude(),
  });

  if (!transaction) {
    throw new CustomerPaymentAccessError(
      "Không tìm thấy giao dịch thanh toán",
      404,
    );
  }

  return mapPaymentTransactionToDto(transaction);
}
