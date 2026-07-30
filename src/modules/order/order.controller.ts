// src/modules/order/order.controller.ts

import { Request, Response } from "express";

import {
  cancelMyOrderService,
  checkoutService,
  getMyOrderDetailService,
  getMyOrdersService,
  OrderServiceError,
} from "./order.service";
import { VoucherServiceError } from "../voucher/voucher.service";

/**
 * Lấy userId từ authMiddleware.
 */
const getUserIdFromRequest = (req: Request) => {
  return req.user?.userId ?? Number.NaN;
};

/**
 * Xử lý lỗi chung cho Order Controller.
 */
const handleOrderError = (res: Response, error: unknown) => {
  if (
    error instanceof OrderServiceError ||
    error instanceof VoucherServiceError
  ) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("[order] unexpected processing error", error);

  return res.status(500).json({
    success: false,
    message: "Xử lý đơn hàng thất bại",
  });
};

/**
 * POST /api/orders/checkout
 */
export const checkoutController = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);

    const data = await checkoutService(userId, req.body);

    return res.status(201).json({
      success: true,
      message: "Đặt hàng thành công",
      data,
    });
  } catch (error) {
    return handleOrderError(res, error);
  }
};

/**
 * GET /api/orders
 */
export const getMyOrdersController = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);

    const data = await getMyOrdersService(userId, req.query);

    return res.json({
      success: true,
      message: "Lấy danh sách đơn hàng thành công",
      data,
    });
  } catch (error) {
    return handleOrderError(res, error);
  }
};

/**
 * GET /api/orders/:orderId
 */
export const getMyOrderDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const orderId = Number(req.params.orderId);

    const data = await getMyOrderDetailService(userId, orderId);

    return res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data,
    });
  } catch (error) {
    return handleOrderError(res, error);
  }
};

/**
 * PATCH /api/orders/:orderId/cancel
 */
export const cancelMyOrderController = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const orderId = Number(req.params.orderId);

    const data = await cancelMyOrderService(userId, orderId);

    return res.json({
      success: true,
      message: "Hủy đơn hàng thành công",
      data,
    });
  } catch (error) {
    return handleOrderError(res, error);
  }
};
