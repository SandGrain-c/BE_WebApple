// src/modules/admin-order/admin-order.service.ts

import prisma from "../../utils/prisma";
import type { Prisma } from "../../generated/prisma/client";
import {
  AdminOrderDto,
  AdminOrderListResponseDto,
  GetAdminOrdersQuery,
  UpdateAdminOrderStatusBody,
  ExpirePendingPaymentsBody,
  ExpirePendingPaymentsResultDto,
} from "./admin-order.dto";
import {
  mapAdminOrderListItemToDto,
  mapAdminOrderToDto,
} from "./admin-order.mapper";
import { restoreOrderInventory } from "../order/order-inventory-restoration";

export class AdminOrderServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ORDER_STATUSES = [
  "PendingPayment",
  "PendingConfirmation",
  "Confirmed",
  "Processing",
  "Shipping",
  "Completed",
  "Cancelled",
] as const;

/**
 * Luồng chuyển trạng thái hợp lệ của đơn hàng.
 *
 * Lưu ý:
 * - PendingPayment không được chuyển thẳng Confirmed.
 * - OnlineBanking sẽ được PayOS webhook chuyển PendingPayment -> PendingConfirmation.
 * - Admin chỉ xác nhận đơn từ PendingConfirmation -> Confirmed.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PendingPayment: ["Cancelled"],
  PendingConfirmation: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Cancelled"],
  Processing: ["Shipping", "Cancelled"],
  Shipping: ["Completed"],
  Completed: [],
  Cancelled: [],
};

/**
 * Include chuẩn cho trang chi tiết đơn hàng.
 */
const orderDetailInclude = {
  order_details: {
    orderBy: {
      order_detail_id: "asc" as const,
    },
    include: {
      product_variants: {
        include: {
          products: true,
        },
      },
    },
  },
  order_status_history: {
    orderBy: {
      created_at: "asc" as const,
    },
    include: {
      users: {
        select: {
          user_id: true,
          full_name: true,
          user_name: true,
        },
      },
    },
  },
};

/**
 * Chuẩn hóa text.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Kiểm tra trạng thái có hợp lệ không.
 */
const ensureValidOrderStatus = (status: string) => {
  if (!ORDER_STATUSES.some((allowedStatus) => allowedStatus === status)) {
    throw new AdminOrderServiceError("Trạng thái đơn hàng không hợp lệ", 400);
  }
};

const parseUpdateAdminOrderStatusBody = (
  value: unknown
): UpdateAdminOrderStatusBody => {
  if (!isRecord(value)) {
    throw new AdminOrderServiceError(
      "Dữ liệu cập nhật trạng thái không hợp lệ",
      400
    );
  }

  if (typeof value.status !== "string") {
    throw new AdminOrderServiceError("Trạng thái đơn hàng không hợp lệ", 400);
  }

  const status = value.status.trim();

  if (!status) {
    throw new AdminOrderServiceError("Vui lòng chọn trạng thái mới", 400);
  }

  ensureValidOrderStatus(status);

  if (
    value.note !== undefined &&
    value.note !== null &&
    typeof value.note !== "string"
  ) {
    throw new AdminOrderServiceError("Ghi chú không hợp lệ", 400);
  }

  return {
    status,
    note: value.note === undefined ? undefined : value.note,
  };
};

/**
 * Kiểm tra có được chuyển từ trạng thái cũ sang trạng thái mới không.
 */
const ensureCanChangeStatus = (oldStatus: string, newStatus: string) => {
  if (oldStatus === newStatus) {
    throw new AdminOrderServiceError(
      "Đơn hàng đang ở trạng thái này rồi",
      400
    );
  }

  const allowedNextStatuses = ALLOWED_TRANSITIONS[oldStatus] ?? [];

  if (!allowedNextStatuses.includes(newStatus)) {
    throw new AdminOrderServiceError(
      `Không thể chuyển trạng thái từ ${oldStatus} sang ${newStatus}`,
      400
    );
  }
};

/**
 * Tự tạo vận chuyển khi đơn hàng được xác nhận.
 *
 * Shipment = vận chuyển.
 * Manual = thủ công, vì hiện tại chưa tích hợp GHN/GHTK/Viettel Post.
 */
const createShipmentWhenOrderConfirmed = async (
  tx: Prisma.TransactionClient,
  orderId: number
) => {
  const existedShipment = await tx.shipments.findFirst({
    where: {
      order_id: orderId,
    },
  });

  if (existedShipment) {
    return existedShipment;
  }

  const shipment = await tx.shipments.create({
    data: {
      order_id: orderId,
      shipping_provider: "Manual",
      tracking_code: null,
      status: "Pending",
    },
  });

  /**
   * Tạo lịch sử vận chuyển ban đầu.
   */
  await tx.shipment_status_history.create({
    data: {
      shipment_id: shipment.shipment_id,
      status: "Pending",
      location: null,
      note: "Hệ thống tự tạo vận chuyển khi admin xác nhận đơn hàng",
    },
  });

  return shipment;
};
  /**
 * Parse số phút hết hạn thanh toán.
 * Mặc định: 30 phút.
 * Tối thiểu: 5 phút.
 * Tối đa: 1440 phút = 1 ngày.
 */
const parseExpireAfterMinutes = (value?: number) => {
  const minutes = Number(value) || 30;

  if (!Number.isInteger(minutes) || minutes < 5) {
    return 30;
  }

  return Math.min(minutes, 1440);
};

/**
 * Parse limit số đơn xử lý mỗi lần.
 * Tránh một request xử lý quá nhiều đơn.
 */
const parseExpireLimit = (value?: number) => {
  const limit = Number(value) || 50;

  if (!Number.isInteger(limit) || limit <= 0) {
    return 50;
  }

  return Math.min(limit, 200);
};
/**
 * Hoàn voucher nếu đơn hàng có sử dụng voucher.
 *
 * Với schema hiện tại, cách an toàn là xóa bản ghi voucher_usages
 * của order bị hủy để voucher không bị tính là đã dùng.
 */
const restoreOrderVoucherUsage = async (
  tx: Prisma.TransactionClient,
  orderId: number
) => {
  await tx.voucher_usages.deleteMany({
    where: {
      order_id: orderId,
    },
  });
};

const synchronizeCancelledOrderRelations = async (
  tx: Prisma.TransactionClient,
  orderId: number,
  cancelledAt: Date
) => {
  await tx.payment_transactions.updateMany({
    where: {
      order_id: orderId,
      payment_type: "Payment",
      status: "Pending",
    },
    data: {
      status: "Cancelled",
      updated_at: cancelledAt,
    },
  });

  const activeShipments = await tx.shipments.findMany({
    where: {
      order_id: orderId,
      status: {
        notIn: ["Cancelled", "Delivered"],
      },
    },
    select: {
      shipment_id: true,
    },
  });

  for (const shipment of activeShipments) {
    await tx.shipments.update({
      where: {
        shipment_id: shipment.shipment_id,
      },
      data: {
        status: "Cancelled",
      },
    });

    await tx.shipment_status_history.create({
      data: {
        shipment_id: shipment.shipment_id,
        status: "Cancelled",
        location: null,
        note: "Đơn hàng đã bị hủy",
      },
    });
  }
};
/**
 * GET /api/admin/orders
 * Lấy danh sách đơn hàng cho Admin.
 */
export const getAdminOrdersService = async (
  query: GetAdminOrdersQuery
): Promise<AdminOrderListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);
  const status = normalizeText(query.status);
  const userId = query.userId ? Number(query.userId) : undefined;

  const where: any = {};

  if (search) {
    where.OR = [
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
    ];
  }

  if (status) {
    ensureValidOrderStatus(status);
    where.order_status = status;
  }

  if (userId !== undefined) {
    if (Number.isNaN(userId)) {
      throw new AdminOrderServiceError("userId không hợp lệ", 400);
    }

    where.user_id = userId;
  }

  if (query.dateFrom || query.dateTo) {
    where.created_at = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);

      if (Number.isNaN(dateFrom.getTime())) {
        throw new AdminOrderServiceError("dateFrom không hợp lệ", 400);
      }

      where.created_at.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      if (Number.isNaN(dateTo.getTime())) {
        throw new AdminOrderServiceError("dateTo không hợp lệ", 400);
      }

      where.created_at.lte = dateTo;
    }
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "total_asc":
      orderBy = { total_amount: "asc" };
      break;
    case "total_desc":
      orderBy = { total_amount: "desc" };
      break;
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [orders, totalItems] = await Promise.all([
    prisma.orders.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        order_details: {
          select: {
            quantity: true,
          },
        },
      },
    }),

    prisma.orders.count({
      where,
    }),
  ]);

  return {
    items: orders.map(mapAdminOrderListItemToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/orders/:orderId
 * Lấy chi tiết đơn hàng cho Admin.
 */
export const getAdminOrderDetailService = async (
  orderId: number
): Promise<AdminOrderDto> => {
  if (!orderId || Number.isNaN(orderId)) {
    throw new AdminOrderServiceError("orderId không hợp lệ", 400);
  }

  const order = await prisma.orders.findUnique({
    where: {
      order_id: orderId,
    },
    include: orderDetailInclude,
  });

  if (!order) {
    throw new AdminOrderServiceError("Không tìm thấy đơn hàng", 404);
  }

  return mapAdminOrderToDto(order);
};

/**
 * PATCH /api/admin/orders/:orderId/status
 * Admin cập nhật trạng thái đơn hàng.
 */
export const updateAdminOrderStatusService = async (
  orderId: number,
  adminUserId: number,
  requestBody: unknown
): Promise<AdminOrderDto> => {
  if (!orderId || Number.isNaN(orderId)) {
    throw new AdminOrderServiceError("orderId không hợp lệ", 400);
  }

  if (!adminUserId || Number.isNaN(adminUserId)) {
    throw new AdminOrderServiceError("Không xác định được admin", 401);
  }

  const body = parseUpdateAdminOrderStatusBody(requestBody);
  const newStatus = body.status;
  const note = normalizeText(body.note);

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.orders.findUnique({
      where: {
        order_id: orderId,
      },
      include: {
        order_details: true,
      },
    });

    if (!order) {
      throw new AdminOrderServiceError("Không tìm thấy đơn hàng", 404);
    }

    const oldStatus = order.order_status;

    ensureCanChangeStatus(oldStatus, newStatus);
    const transitionedAt = new Date();
    const claimedOrder = await tx.orders.updateMany({
      where: {
        order_id: orderId,
        order_status: oldStatus,
      },
      data: {
        order_status: newStatus,
        updated_at: transitionedAt,
      },
    });

    if (claimedOrder.count !== 1) {
      throw new AdminOrderServiceError(
        "Trạng thái đơn hàng đã được thay đổi",
        400
      );
    }

    /**
     * Nếu chuyển sang Cancelled:
     * - Hoàn lại tồn kho.
     * - Hoàn voucher nếu đơn có dùng voucher.
     *
     * ALLOWED_TRANSITIONS đã chặn không cho hủy đơn ở Shipping/Completed.
     */
    if (newStatus === "Cancelled") {
      await restoreOrderInventory(tx, order.order_id);

      if (order.voucher_id) {
        await tx.voucher_usages.deleteMany({
          where: {
            order_id: order.order_id,
          },
        });

        await tx.vouchers.updateMany({
          where: {
            voucher_id: order.voucher_id,
            used_count: {
              gt: 0,
            },
          },
          data: {
            used_count: {
              decrement: 1,
            },
          },
        });
      }

      await synchronizeCancelledOrderRelations(
        tx,
        order.order_id,
        transitionedAt
      );
    }

    /**
     * Khi admin xác nhận đơn:
     * PendingConfirmation -> Confirmed
     * thì BE tự tạo shipment Pending để kho/admin xử lý vận chuyển.
     */
    if (newStatus === "Confirmed") {
      await createShipmentWhenOrderConfirmed(tx, order.order_id);
    }

    await tx.order_status_history.create({
      data: {
        order_id: orderId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: adminUserId,
        note:
          note ||
          `Admin cập nhật trạng thái từ ${oldStatus} sang ${newStatus}`,
      },
    });

    return tx.orders.findUnique({
      where: {
        order_id: orderId,
      },
      include: orderDetailInclude,
    });
  });

  if (!updatedOrder) {
    throw new AdminOrderServiceError(
      "Cập nhật trạng thái đơn hàng thất bại",
      500
    );
  }

  return mapAdminOrderToDto(updatedOrder);
};

/**
 * POST /api/admin/orders/expire-pending-payments
 *
 * Hủy các đơn OnlineBanking/PayOS đang PendingPayment quá lâu.
 *
 * Flow:
 * PendingPayment quá hạn
 * → Cancelled
 * → payment Pending thành Cancelled
 * → hoàn tồn kho
 * → hoàn voucher
 */
export const expirePendingPaymentsService = async (
  actorId: number,
  body: ExpirePendingPaymentsBody
): Promise<ExpirePendingPaymentsResultDto> => {
  const expireAfterMinutes = parseExpireAfterMinutes(
    body.expireAfterMinutes
  );

  const limit = parseExpireLimit(body.limit);

  const now = new Date();

  const expiredBefore = new Date(
    now.getTime() - expireAfterMinutes * 60 * 1000
  );

  /**
   * Tìm các đơn PendingPayment đã quá hạn.
   *
   * Chỉ lấy order_id để xử lý gọn.
   */
  const expiredOrders = await prisma.orders.findMany({
    where: {
      order_status: "PendingPayment",
      created_at: {
        lte: expiredBefore,
      },
      payment_transactions: {
        some: {
          payment_type: "Payment",
          status: "Pending",
        },
      },
    },
    select: {
      order_id: true,
    },
    orderBy: {
      created_at: "asc",
    },
    take: limit,
  });

  const expiredOrderIds: number[] = [];

  for (const expiredOrder of expiredOrders) {
    await prisma.$transaction(async (tx) => {
      /**
       * Lấy lại order trong transaction để tránh xử lý nhầm
       * nếu order vừa được PayOS webhook cập nhật thành công.
       */
      const order = await tx.orders.findUnique({
        where: {
          order_id: expiredOrder.order_id,
        },
        select: {
          order_id: true,
          order_status: true,
        },
      });

      if (!order || order.order_status !== "PendingPayment") {
        return;
      }

      const pendingPayment = await tx.payment_transactions.findFirst({
        where: {
          order_id: order.order_id,
          payment_type: "Payment",
          status: "Pending",
        },
        select: {
          transaction_id: true,
          gateway: true,
        },
      });

      if (!pendingPayment) {
        return;
      }

      /**
       * Chỉ expire đơn thanh toán online.
       * COD không bao giờ ở PendingPayment theo flow hiện tại.
       */
      if (pendingPayment.gateway === "COD") {
        return;
      }

      await tx.orders.update({
        where: {
          order_id: order.order_id,
        },
        data: {
          order_status: "Cancelled",
          updated_at: now,
        },
      });

      await tx.payment_transactions.updateMany({
        where: {
          order_id: order.order_id,
          payment_type: "Payment",
          status: "Pending",
        },
        data: {
          status: "Cancelled",
          gateway_response: JSON.stringify({
            source: "PAYMENT_EXPIRE_JOB",
            message: `Tự động hủy do quá ${expireAfterMinutes} phút chưa thanh toán`,
            expiredAt: now.toISOString(),
            actorId,
          }),
          updated_at: now,
        },
      });

      await restoreOrderInventory(tx, order.order_id);

      await restoreOrderVoucherUsage(tx, order.order_id);

      await tx.order_status_history.create({
        data: {
          order_id: order.order_id,
          old_status: "PendingPayment",
          new_status: "Cancelled",
          changed_by: actorId,
          note: `Tự động hủy đơn do quá ${expireAfterMinutes} phút chưa thanh toán`,
        },
      });

      expiredOrderIds.push(order.order_id);
    });
  }

  return {
    expireAfterMinutes,
    expiredOrderCount: expiredOrderIds.length,
    expiredOrderIds,
  };
};
