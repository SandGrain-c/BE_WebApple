// src/modules/admin-order/admin-order.controller.ts

import { Request, Response } from "express";

import {
  AdminOrderServiceError,
  getAdminOrderDetailService,
  getAdminOrdersService,
  updateAdminOrderStatusService,
  expirePendingPaymentsService,
} from "./admin-order.service";
import { GetAdminOrdersQuery } from "./admin-order.dto";

/**
 * Lấy admin userId từ authMiddleware.
 */
const getAdminUserIdFromRequest = (req: Request) => {
  return Number(req.user?.userId);
};
const getActorIdFromRequest = (req: Request): number => {
  const numberUserId = Number(req.user?.userId);

  if (!Number.isInteger(numberUserId) || numberUserId <= 0) {
    return 0;
  }

  return numberUserId;
};

/**
 * Xử lý lỗi chung cho Admin Order Controller.
 */
const handleAdminOrderError = (res: Response, error: unknown) => {
  if (error instanceof AdminOrderServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("[admin-order] unexpected processing error", error);

  return res.status(500).json({
    success: false,
    message: "Xử lý đơn hàng thất bại",
  });
};

/**
 * GET /api/admin/orders
 */
export const getAdminOrdersController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminOrdersService(
      req.query as GetAdminOrdersQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách đơn hàng admin thành công",
      data,
    });
  } catch (error) {
    return handleAdminOrderError(res, error);
  }
};

/**
 * GET /api/admin/orders/:orderId
 */
export const getAdminOrderDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const orderId = Number(req.params.orderId);

    const data = await getAdminOrderDetailService(orderId);

    return res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng admin thành công",
      data,
    });
  } catch (error) {
    return handleAdminOrderError(res, error);
  }
};

/**
 * PATCH /api/admin/orders/:orderId/status
 */
export const updateAdminOrderStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const orderId = Number(req.params.orderId);
    const adminUserId = getAdminUserIdFromRequest(req);

    const data = await updateAdminOrderStatusService(
      orderId,
      adminUserId,
      req.body
    );

    return res.json({
      success: true,
      message: "Cập nhật trạng thái đơn hàng thành công",
      data,
    });
  } catch (error) {
    return handleAdminOrderError(res, error);
  }
};
export const expirePendingPaymentsController = async (
  req: Request,
  res: Response
) => {
  try {
    const actorId = getActorIdFromRequest(req);

    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const data = await expirePendingPaymentsService(actorId, req.body);

    return res.status(200).json({
      success: true,
      message:
        data.expiredOrderCount > 0
          ? "Đã hủy các đơn thanh toán quá hạn"
          : "Không có đơn thanh toán quá hạn cần hủy",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Hủy đơn thanh toán quá hạn thất bại",
    });
  }
};
