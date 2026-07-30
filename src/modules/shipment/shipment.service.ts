// src/modules/shipment/shipment.service.ts

import prisma from "../../utils/prisma";
import { Prisma } from "../../generated/prisma/client";
import type {
  ShipmentStatus,
} from "./shipment.dto";
import { mapShipmentToDto } from "./shipment.mapper";
import {
  CustomerShipmentAccessError,
  shipmentConflictError,
  shipmentNotFoundError,
  shipmentValidationError,
} from "./shipment.error";
import {
  parseAdminShipmentListQuery,
  parseCreateShipmentBody,
  parseUpdateShipmentBody,
  parseUpdateShipmentStatusBody,
} from "./shipment.validation";

const VALID_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  Pending: ["Preparing", "Cancelled"],
  Preparing: ["Shipped", "Cancelled"],
  Shipped: ["InTransit", "Delivered", "Failed"],
  InTransit: ["Delivered", "Failed"],
  Failed: ["InTransit", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

function validatePositiveId(value: number, fieldName: string) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }
}

function isShipmentStatus(value: string): value is ShipmentStatus {
  return Object.hasOwn(VALID_SHIPMENT_TRANSITIONS, value);
}

function getStoredShipmentStatus(value: string) {
  if (!isShipmentStatus(value)) {
    throw shipmentConflictError(
      "Trạng thái vận chuyển hiện tại không hợp lệ",
    );
  }

  return value;
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getOrderStatusByShipmentStatus(status: ShipmentStatus) {
  // Đồng bộ nhẹ giữa shipment và order
  if (status === "Preparing") return "Processing";
  if (status === "Shipped" || status === "InTransit") return "Shipping";
  if (status === "Delivered") return "Completed";

  return null;
}

async function writeAuditLog(params: {
  tx: Prisma.TransactionClient;
  actorId?: number;
  action: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}) {
  await params.tx.audit_logs.create({
    data: {
      user_id: params.actorId,
      action: params.action,
      entity_type: "shipments",
      entity_id: params.entityId,
      old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
      new_value: params.newValue ? JSON.stringify(params.newValue) : null,
      ip_address: params.ipAddress,
    },
  });
}

function getShipmentInclude() {
  return {
    orders: {
      select: {
        order_id: true,
        order_code: true,
        order_status: true,
        customer_name: true,
        customer_phone: true,
        shipping_address: true,
        total_amount: true,
        created_at: true,
      },
    },
    shipment_status_history: {
      orderBy: {
        updated_at: "desc" as const,
      },
    },
  };
}

export async function getAdminShipments(requestQuery: unknown) {
  const query = parseAdminShipmentListQuery(requestQuery);
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const where: Prisma.shipmentsWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.orderId !== undefined) {
    where.order_id = query.orderId;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();

    where.OR = [
      {
        tracking_code: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        shipping_provider: {
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
      : query.sort === "status_asc"
        ? { status: "asc" as const }
        : query.sort === "status_desc"
          ? { status: "desc" as const }
          : { created_at: "desc" as const };

  const [items, totalItems] = await Promise.all([
    prisma.shipments.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: getShipmentInclude(),
    }),
    prisma.shipments.count({ where }),
  ]);

  return {
    items: items.map(mapShipmentToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getAdminShipmentById(shipmentId: number) {
  validatePositiveId(shipmentId, "shipmentId");

  const shipment = await prisma.shipments.findUnique({
    where: {
      shipment_id: shipmentId,
    },
    include: getShipmentInclude(),
  });

  if (!shipment) {
    throw shipmentNotFoundError("Không tìm thấy thông tin vận chuyển");
  }

  return mapShipmentToDto(shipment);
}

export async function createAdminShipment(
  requestBody: unknown,
  actorId?: number,
  ipAddress?: string
) {
  const dto = parseCreateShipmentBody(requestBody);
  const initialStatus: ShipmentStatus = "Pending";

  try {
    const createdShipment = await prisma.$transaction(async (tx) => {
      const lockedOrders = await tx.$queryRaw<Array<{ order_id: number }>>`
        SELECT order_id
        FROM orders
        WHERE order_id = ${dto.orderId}
        FOR UPDATE
      `;

      if (lockedOrders.length !== 1) {
        throw shipmentNotFoundError("Không tìm thấy đơn hàng");
      }

      const order = await tx.orders.findUnique({
        where: {
          order_id: dto.orderId,
        },
        include: {
          payment_transactions: {
            where: {
              payment_type: "Payment",
            },
            orderBy: {
              created_at: "desc",
            },
          },
        },
      });

      if (!order) {
        throw shipmentNotFoundError("Không tìm thấy đơn hàng");
      }

      if (
        !["Confirmed", "Processing", "Shipping"].includes(
          order.order_status,
        )
      ) {
        throw shipmentValidationError(
          "Đơn hàng chưa đủ điều kiện tạo vận chuyển",
        );
      }

      const payment = order.payment_transactions[0];

      if (!payment) {
        throw shipmentValidationError(
          "Đơn hàng chưa có thông tin thanh toán hợp lệ",
        );
      }

      if (payment.gateway !== "COD" && payment.status !== "Success") {
        throw shipmentValidationError(
          "Đơn hàng trực tuyến chưa thanh toán thành công",
        );
      }

      const existedShipment = await tx.shipments.findFirst({
        where: {
          order_id: dto.orderId,
        },
      });

      if (existedShipment) {
        throw shipmentConflictError(
          "Đơn hàng này đã có thông tin vận chuyển",
        );
      }

      if (dto.trackingCode) {
        const duplicatedTrackingCode = await tx.shipments.findFirst({
          where: {
            tracking_code: dto.trackingCode,
          },
        });

        if (duplicatedTrackingCode) {
          throw shipmentConflictError("Mã vận đơn đã tồn tại");
        }
      }

      const shipment = await tx.shipments.create({
        data: {
          order_id: dto.orderId,
          shipping_provider: dto.shippingProvider ?? null,
          tracking_code: dto.trackingCode ?? null,
          status: initialStatus,
        },
      });

      await tx.shipment_status_history.create({
        data: {
          shipment_id: shipment.shipment_id,
          status: initialStatus,
          location: dto.location ?? null,
          note: dto.note ?? "Tạo thông tin vận chuyển",
        },
      });

      if (order.order_status === "Confirmed") {
        await tx.orders.update({
          where: {
            order_id: dto.orderId,
          },
          data: {
            order_status: "Processing",
            updated_at: new Date(),
          },
        });

        await tx.order_status_history.create({
          data: {
            order_id: dto.orderId,
            old_status: order.order_status,
            new_status: "Processing",
            changed_by: actorId,
            note: "Tạo thông tin vận chuyển",
          },
        });
      }

      await writeAuditLog({
        tx,
        actorId,
        action: "CREATE_SHIPMENT",
        entityId: shipment.shipment_id,
        newValue: shipment,
        ipAddress,
      });

      return shipment;
    });

    return getAdminShipmentById(createdShipment.shipment_id);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw shipmentConflictError("Mã vận đơn đã tồn tại");
    }

    throw error;
  }
}
/**
 * Khi vận chuyển giao hàng thành công:
 * - Nếu đơn hàng thanh toán COD
 * - Và payment_transaction còn Pending
 * - Thì tự chuyển payment_transaction sang Success
 *
 * COD = Cash On Delivery, nghĩa là thanh toán khi nhận hàng.
 */
const markCODPaymentSuccessWhenDelivered = async (
  tx: Prisma.TransactionClient,
  orderId: number,
  adminUserId?: number
) => {
  const now = new Date();

  const pendingCODPayment = await tx.payment_transactions.findFirst({
    where: {
      order_id: orderId,
      gateway: "COD",
      payment_type: "Payment",
      status: "Pending",
    },
  });

  /**
   * Nếu không có giao dịch COD pending thì bỏ qua.
   * Ví dụ:
   * - Đơn OnlineBanking qua PayOS đã Success rồi
   * - COD đã được admin xác nhận trước đó
   */
  if (!pendingCODPayment) {
    return null;
  }

  return tx.payment_transactions.update({
    where: {
      transaction_id: pendingCODPayment.transaction_id,
    },
    data: {
      status: "Success",
      paid_at: now,
      gateway_response: JSON.stringify({
        source: "SHIPMENT_DELIVERED",
        message: "Tự động xác nhận COD khi giao hàng thành công",
        confirmedBy: adminUserId ?? null,
        confirmedAt: now.toISOString(),
      }),
      updated_at: now,
    },
  });
};
export async function updateAdminShipment(
  shipmentId: number,
  requestBody: unknown,
  actorId?: number,
  ipAddress?: string
) {
  validatePositiveId(shipmentId, "shipmentId");
  const dto = parseUpdateShipmentBody(requestBody);

  const currentShipment = await prisma.shipments.findUnique({
    where: {
      shipment_id: shipmentId,
    },
  });

  if (!currentShipment) {
    throw shipmentNotFoundError("Không tìm thấy thông tin vận chuyển");
  }

  if (["Delivered", "Cancelled"].includes(currentShipment.status)) {
    throw shipmentValidationError(
      "Không thể cập nhật vận chuyển đã hoàn tất hoặc đã hủy",
    );
  }

  const updateData: Prisma.shipmentsUncheckedUpdateInput = {};

  if (dto.shippingProvider !== undefined) {
    updateData.shipping_provider = dto.shippingProvider;
  }

  if (dto.trackingCode !== undefined) {
    const duplicatedTrackingCode = await prisma.shipments.findFirst({
      where: {
        shipment_id: {
          not: shipmentId,
        },
        tracking_code: dto.trackingCode,
      },
    });

    if (duplicatedTrackingCode) {
      throw shipmentConflictError("Mã vận đơn đã tồn tại");
    }

    updateData.tracking_code = dto.trackingCode;
  }

  try {
    const updatedShipment = await prisma.$transaction(async (tx) => {
      const updated = await tx.shipments.update({
        where: {
          shipment_id: shipmentId,
        },
        data: updateData,
      });

      await writeAuditLog({
        tx,
        actorId,
        action: "UPDATE_SHIPMENT",
        entityId: shipmentId,
        oldValue: currentShipment,
        newValue: updated,
        ipAddress,
      });

      return updated;
    });

    return getAdminShipmentById(updatedShipment.shipment_id);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw shipmentConflictError("Mã vận đơn đã tồn tại");
    }

    throw error;
  }
}

export async function updateAdminShipmentStatus(
  shipmentId: number,
  requestBody: unknown,
  actorId?: number,
  ipAddress?: string
) {
  validatePositiveId(shipmentId, "shipmentId");
  const dto = parseUpdateShipmentStatusBody(requestBody);

  const currentShipment = await prisma.shipments.findUnique({
    where: {
      shipment_id: shipmentId,
    },
    include: {
      orders: true,
    },
  });

  if (!currentShipment) {
    throw shipmentNotFoundError("Không tìm thấy thông tin vận chuyển");
  }

  const oldStatus = getStoredShipmentStatus(currentShipment.status);
  const newStatus = dto.status;

  if (oldStatus === newStatus) {
    throw shipmentConflictError("Trạng thái vận chuyển không thay đổi");
  }

  const allowedNextStatuses = VALID_SHIPMENT_TRANSITIONS[oldStatus];

  if (!allowedNextStatuses.includes(newStatus)) {
    throw shipmentValidationError(
      `Không thể chuyển trạng thái từ ${oldStatus} sang ${newStatus}`,
    );
  }

  if (currentShipment.orders.order_status === "Cancelled") {
    throw shipmentValidationError(
      "Không thể cập nhật vận chuyển cho đơn hàng đã hủy",
    );
  }

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const claimedShipment = await tx.shipments.updateMany({
      where: {
        shipment_id: shipmentId,
        status: oldStatus,
      },
      data: {
        status: newStatus,
      },
    });

    if (claimedShipment.count !== 1) {
      throw shipmentConflictError(
        "Trạng thái vận chuyển đã được thay đổi",
      );
    }

    const updated = await tx.shipments.findUnique({
      where: {
        shipment_id: shipmentId,
      },
    });

    if (!updated) {
      throw new Error("Shipment disappeared after status transition");
    }

    await tx.shipment_status_history.create({
      data: {
        shipment_id: shipmentId,
        status: newStatus,
        location: dto.location ?? null,
        note: dto.note ?? null,
      },
    });

    const nextOrderStatus = getOrderStatusByShipmentStatus(newStatus);

    /**
     * Đồng bộ trạng thái order theo shipment.
     * Preparing  -> Processing
     * Shipped    -> Shipping
     * InTransit  -> Shipping
     * Delivered  -> Completed
     */
    if (
      nextOrderStatus &&
      currentShipment.orders.order_status !== nextOrderStatus &&
      !["Cancelled", "Completed"].includes(currentShipment.orders.order_status)
    ) {
      await tx.orders.update({
        where: {
          order_id: currentShipment.order_id,
        },
        data: {
          order_status: nextOrderStatus,
          updated_at: new Date(),
        },
      });

      await tx.order_status_history.create({
        data: {
          order_id: currentShipment.order_id,
          old_status: currentShipment.orders.order_status,
          new_status: nextOrderStatus,
          changed_by: actorId,
          note: `Đồng bộ theo trạng thái vận chuyển: ${newStatus}`,
        },
      });
    }

    /**
     * Điểm mới:
     * Khi vận chuyển Delivered, nếu đơn là COD và payment còn Pending
     * thì tự xác nhận thanh toán thành Success.
     */
    if (newStatus === "Delivered") {
      await markCODPaymentSuccessWhenDelivered(
        tx,
        currentShipment.order_id,
        actorId
      );
    }

    await writeAuditLog({
      tx,
      actorId,
      action: "UPDATE_SHIPMENT_STATUS",
      entityId: shipmentId,
      oldValue: currentShipment,
      newValue: updated,
      ipAddress,
    });

    return updated;
  });

  return getAdminShipmentById(updatedShipment.shipment_id);
}

export async function cancelAdminShipment(
  shipmentId: number,
  actorId?: number,
  ipAddress?: string
) {
  validatePositiveId(shipmentId, "shipmentId");

  const currentShipment = await prisma.shipments.findUnique({
    where: {
      shipment_id: shipmentId,
    },
  });

  if (!currentShipment) {
    throw shipmentNotFoundError("Không tìm thấy thông tin vận chuyển");
  }

  if (currentShipment.status === "Delivered") {
    throw shipmentValidationError(
      "Không thể hủy vận chuyển đã giao thành công",
    );
  }

  if (currentShipment.status === "Cancelled") {
    throw shipmentConflictError("Vận chuyển đã bị hủy trước đó");
  }

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const claimedShipment = await tx.shipments.updateMany({
      where: {
        shipment_id: shipmentId,
        status: currentShipment.status,
      },
      data: {
        status: "Cancelled",
      },
    });

    if (claimedShipment.count !== 1) {
      throw shipmentConflictError(
        "Trạng thái vận chuyển đã được thay đổi",
      );
    }

    const updated = await tx.shipments.findUnique({
      where: {
        shipment_id: shipmentId,
      },
    });

    if (!updated) {
      throw new Error("Shipment disappeared after cancellation");
    }

    await tx.shipment_status_history.create({
      data: {
        shipment_id: shipmentId,
        status: "Cancelled",
        note: "Hủy thông tin vận chuyển",
      },
    });

    await writeAuditLog({
      tx,
      actorId,
      action: "CANCEL_SHIPMENT",
      entityId: shipmentId,
      oldValue: currentShipment,
      newValue: updated,
      ipAddress,
    });

    return updated;
  });

  return getAdminShipmentById(updatedShipment.shipment_id);
}

export async function getCustomerShipmentByOrderId(orderId: number, userId: number) {
  validatePositiveId(orderId, "orderId");
  validatePositiveId(userId, "userId");

  const shipment = await prisma.shipments.findFirst({
    where: {
      order_id: orderId,
      orders: {
        is: {
          user_id: userId,
        },
      },
    },
    include: getShipmentInclude(),
  });

  if (!shipment) {
    throw new CustomerShipmentAccessError(
      "Không tìm thấy thông tin vận chuyển của đơn hàng",
      404,
    );
  }

  return mapShipmentToDto(shipment);
}

export async function getCustomerShipmentById(shipmentId: number, userId: number) {
  validatePositiveId(shipmentId, "shipmentId");
  validatePositiveId(userId, "userId");

  const shipment = await prisma.shipments.findFirst({
    where: {
      shipment_id: shipmentId,
      orders: {
        is: {
          user_id: userId,
        },
      },
    },
    include: getShipmentInclude(),
  });

  if (!shipment) {
    throw new CustomerShipmentAccessError(
      "Không tìm thấy thông tin vận chuyển",
      404,
    );
  }

  return mapShipmentToDto(shipment);
}
