// src/modules/admin-notification/admin-notification.service.ts

import prisma from "../../utils/prisma";
import { AdminNotificationSummaryDto } from "./admin-notification.dto";

export class AdminNotificationServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Lấy thời điểm đầu ngày hiện tại.
 * Dùng để đếm payment success trong ngày.
 */
const getStartOfToday = () => {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date;
};

/**
 * GET /api/admin/notifications/summary
 *
 * API tổng hợp số lượng thông báo/badge cho Admin.
 *
 * Badge = số nhỏ hiển thị ở menu/sidebar/header để báo có việc cần xử lý.
 */
export const getAdminNotificationSummaryService =
  async (): Promise<AdminNotificationSummaryDto> => {
    const startOfToday = getStartOfToday();

    const [
      pendingPaymentOrders,
      pendingConfirmationOrders,
      confirmedOrders,
      processingOrders,
      shippingOrders,

      pendingPayments,
      pendingCODPayments,
      pendingOnlineBankingPayments,
      successPaymentsToday,

      pendingShipments,
      preparingShipments,
      shippedShipments,
      inTransitShipments,
      failedShipments,

      hiddenReviews,
    ] = await Promise.all([
      /**
       * Orders - đơn hàng.
       */
      prisma.orders.count({
        where: {
          order_status: "PendingPayment",
        },
      }),

      prisma.orders.count({
        where: {
          order_status: "PendingConfirmation",
        },
      }),

      prisma.orders.count({
        where: {
          order_status: "Confirmed",
        },
      }),

      prisma.orders.count({
        where: {
          order_status: "Processing",
        },
      }),

      prisma.orders.count({
        where: {
          order_status: "Shipping",
        },
      }),

      /**
       * Payments - thanh toán.
       */
      prisma.payment_transactions.count({
        where: {
          status: "Pending",
        },
      }),

      prisma.payment_transactions.count({
        where: {
          gateway: "COD",
          status: "Pending",
        },
      }),

      prisma.payment_transactions.count({
        where: {
          gateway: "payOS",
          status: "Pending",
        },
      }),

      prisma.payment_transactions.count({
        where: {
          status: "Success",
          paid_at: {
            gte: startOfToday,
          },
        },
      }),

      /**
       * Shipments - vận chuyển.
       */
      prisma.shipments.count({
        where: {
          status: "Pending",
        },
      }),

      prisma.shipments.count({
        where: {
          status: "Preparing",
        },
      }),

      prisma.shipments.count({
        where: {
          status: "Shipped",
        },
      }),

      prisma.shipments.count({
        where: {
          status: "InTransit",
        },
      }),

      prisma.shipments.count({
        where: {
          status: "Failed",
        },
      }),

      /**
       * Reviews - đánh giá.
       *
       * Schema hiện tại có is_active.
       * is_active = false có thể hiểu là đánh giá đang bị ẩn/chờ xử lý.
       */
      prisma.reviews.count({
        where: {
          is_active: false,
        },
      }),
    ]);

    /**
     * Đơn hàng mới cần admin xử lý chính là PendingConfirmation.
     *
     * OnlineBanking:
     * - PayOS webhook thành công
     * - order chuyển từ PendingPayment sang PendingConfirmation
     *
     * COD:
     * - checkout xong là PendingConfirmation
     */
    const newOrders = pendingConfirmationOrders;

    /**
     * Vận chuyển cần xử lý:
     * - Pending: mới tạo shipment, kho/admin cần xử lý.
     * - Failed: giao thất bại, cần xử lý lại.
     */
    const shipmentNeedAction = pendingShipments + failedShipments;

    /**
     * Tổng badge nên chỉ tính các việc thật sự cần admin chú ý.
     *
     * Không cộng tất cả mọi trạng thái để tránh badge quá lớn.
     */
    const totalBadge =
      newOrders +
      pendingPayments +
      shipmentNeedAction +
      hiddenReviews;

    return {
      orders: {
        pendingPayment: pendingPaymentOrders,
        pendingConfirmation: pendingConfirmationOrders,
        confirmed: confirmedOrders,
        processing: processingOrders,
        shipping: shippingOrders,
        newOrders,
      },

      payments: {
        pending: pendingPayments,
        pendingCOD: pendingCODPayments,
        pendingOnlineBanking: pendingOnlineBankingPayments,
        successToday: successPaymentsToday,
      },

      shipments: {
        pending: pendingShipments,
        preparing: preparingShipments,
        shipped: shippedShipments,
        inTransit: inTransitShipments,
        failed: failedShipments,
        needAction: shipmentNeedAction,
      },

      reviews: {
        hidden: hiddenReviews,
      },

      totalBadge,
    };
  };