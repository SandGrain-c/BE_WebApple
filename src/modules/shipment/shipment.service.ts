// src/modules/shipment/shipment.service.ts

import prisma from "../../utils/prisma";
import type {
  AdminShipmentListQueryDto,
  CreateShipmentDto,
  ShipmentStatus,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
} from "./shipment.dto";
import { mapShipmentToDto } from "./shipment.mapper";

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "Pending",
  "Preparing",
  "Shipped",
  "InTransit",
  "Delivered",
  "Failed",
  "Cancelled",
];

const VALID_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  Pending: ["Preparing", "Cancelled"],
  Preparing: ["Shipped", "Cancelled"],
  Shipped: ["InTransit", "Delivered", "Failed"],
  InTransit: ["Delivered", "Failed"],
  Failed: ["InTransit", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

function normalizeText(value?: string | null) {
  // Chuẩn hóa chuỗi: bỏ khoảng trắng thừa
  return value?.trim() || null;
}

function validateShipmentStatus(status?: string): asserts status is ShipmentStatus {
  if (!status || !SHIPMENT_STATUSES.includes(status as ShipmentStatus)) {
    throw new Error("Trạng thái vận chuyển không hợp lệ");
  }
}

function validatePositiveId(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} không hợp lệ`);
  }
}

function getOrderStatusByShipmentStatus(status: ShipmentStatus) {
  // Đồng bộ nhẹ giữa shipment và order
  if (status === "Preparing") return "Processing";
  if (status === "Shipped" || status === "InTransit") return "Shipping";
  if (status === "Delivered") return "Completed";

  return null;
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
  // Audit log: ghi lại thao tác admin để phục vụ kiểm tra sau này
  const client = params.tx ?? prisma;

  await client.audit_logs.create({
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

export async function getAdminShipments(query: AdminShipmentListQueryDto) {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (query.status) {
    validateShipmentStatus(query.status);
    where.status = query.status;
  }

  if (query.orderId) {
    validatePositiveId(Number(query.orderId), "orderId");
    where.order_id = Number(query.orderId);
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
    throw new Error("Không tìm thấy thông tin vận chuyển");
  }

  return mapShipmentToDto(shipment);
}

export async function createAdminShipment(
  dto: CreateShipmentDto,
  actorId?: number,
  ipAddress?: string
) {
  const orderId = Number(dto.orderId);
  const shippingProvider = normalizeText(dto.shippingProvider);
  const trackingCode = normalizeText(dto.trackingCode);
  const status = dto.status ?? "Pending";
  const location = normalizeText(dto.location);
  const note = normalizeText(dto.note);

  validatePositiveId(orderId, "orderId");
  validateShipmentStatus(status);

  const order = await prisma.orders.findUnique({
    where: {
      order_id: orderId,
    },
  });

  if (!order) {
    throw new Error("Không tìm thấy đơn hàng");
  }

  if (["Cancelled", "Completed"].includes(order.order_status)) {
    throw new Error("Không thể tạo vận chuyển cho đơn hàng đã hoàn tất hoặc đã hủy");
  }

  if (["PendingPayment", "PendingConfirmation"].includes(order.order_status)) {
    throw new Error("Chỉ tạo vận chuyển sau khi đơn hàng đã được xác nhận");
  }

  const existedShipment = await prisma.shipments.findFirst({
    where: {
      order_id: orderId,
    },
  });

  if (existedShipment) {
    throw new Error("Đơn hàng này đã có thông tin vận chuyển");
  }

  if (trackingCode) {
    const duplicatedTrackingCode = await prisma.shipments.findFirst({
      where: {
        tracking_code: trackingCode,
      },
    });

    if (duplicatedTrackingCode) {
      throw new Error("Mã vận đơn đã tồn tại");
    }
  }

  const createdShipment = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipments.create({
      data: {
        order_id: orderId,
        shipping_provider: shippingProvider,
        tracking_code: trackingCode,
        status,
      },
    });

    await tx.shipment_status_history.create({
      data: {
        shipment_id: shipment.shipment_id,
        status,
        location,
        note: note ?? "Tạo thông tin vận chuyển",
      },
    });

    // Khi tạo shipment, đơn hàng chuyển sang Processing nếu đang Confirmed
    if (order.order_status === "Confirmed") {
      await tx.orders.update({
        where: {
          order_id: orderId,
        },
        data: {
          order_status: "Processing",
          updated_at: new Date(),
        },
      });

      await tx.order_status_history.create({
        data: {
          order_id: orderId,
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
  tx: any,
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
  dto: UpdateShipmentDto,
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
    throw new Error("Không tìm thấy thông tin vận chuyển");
  }

  if (["Delivered", "Cancelled"].includes(currentShipment.status)) {
    throw new Error("Không thể cập nhật vận chuyển đã hoàn tất hoặc đã hủy");
  }

  const updateData: any = {};

  if (dto.shippingProvider !== undefined) {
    updateData.shipping_provider = normalizeText(dto.shippingProvider);
  }

  if (dto.trackingCode !== undefined) {
    const trackingCode = normalizeText(dto.trackingCode);

    if (trackingCode) {
      const duplicatedTrackingCode = await prisma.shipments.findFirst({
        where: {
          shipment_id: {
            not: shipmentId,
          },
          tracking_code: trackingCode,
        },
      });

      if (duplicatedTrackingCode) {
        throw new Error("Mã vận đơn đã tồn tại");
      }
    }

    updateData.tracking_code = trackingCode;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("Không có dữ liệu cần cập nhật");
  }

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
}

export async function updateAdminShipmentStatus(
  shipmentId: number,
  dto: UpdateShipmentStatusDto,
  actorId?: number,
  ipAddress?: string
) {
  validatePositiveId(shipmentId, "shipmentId");
  validateShipmentStatus(dto.status);

  const location = normalizeText(dto.location);
  const note = normalizeText(dto.note);

  const currentShipment = await prisma.shipments.findUnique({
    where: {
      shipment_id: shipmentId,
    },
    include: {
      orders: true,
    },
  });

  if (!currentShipment) {
    throw new Error("Không tìm thấy thông tin vận chuyển");
  }

  const oldStatus = currentShipment.status as ShipmentStatus;
  const newStatus = dto.status;

  if (oldStatus === newStatus) {
    throw new Error("Trạng thái vận chuyển không thay đổi");
  }

  const allowedNextStatuses = VALID_SHIPMENT_TRANSITIONS[oldStatus];

  if (!allowedNextStatuses.includes(newStatus)) {
    throw new Error(`Không thể chuyển trạng thái từ ${oldStatus} sang ${newStatus}`);
  }

  if (currentShipment.orders.order_status === "Cancelled") {
    throw new Error("Không thể cập nhật vận chuyển cho đơn hàng đã hủy");
  }

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const updated = await tx.shipments.update({
      where: {
        shipment_id: shipmentId,
      },
      data: {
        status: newStatus,
      },
    });

    await tx.shipment_status_history.create({
      data: {
        shipment_id: shipmentId,
        status: newStatus,
        location,
        note,
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
    throw new Error("Không tìm thấy thông tin vận chuyển");
  }

  if (currentShipment.status === "Delivered") {
    throw new Error("Không thể hủy vận chuyển đã giao thành công");
  }

  if (currentShipment.status === "Cancelled") {
    throw new Error("Vận chuyển đã bị hủy trước đó");
  }

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const updated = await tx.shipments.update({
      where: {
        shipment_id: shipmentId,
      },
      data: {
        status: "Cancelled",
      },
    });

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
    throw new Error("Không tìm thấy thông tin vận chuyển của đơn hàng");
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
    throw new Error("Không tìm thấy thông tin vận chuyển");
  }

  return mapShipmentToDto(shipment);
}