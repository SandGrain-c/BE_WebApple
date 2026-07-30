// src/modules/payment-transaction/payos-payment.controller.ts

import type { Request, Response } from "express";
import {
  createPayOSPaymentLinkForOrder,
  getPayOSPaymentStatus,
  handlePayOSWebhook,
  PayOSPaymentError,
} from "./payos-payment.service";

function getUserId(req: Request) {
  return req.user?.userId;
}

function parsePositiveIntegerPath(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function handlePayOSError(
  res: Response,
  error: unknown,
  context: "initialization" | "status" | "webhook",
) {
  if (error instanceof PayOSPaymentError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("[payos] unexpected processing error", {
    context,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });

  return res.status(500).json({
    success: false,
    message: "Xử lý thanh toán thất bại",
  });
}

/**
 * Customer tạo link/QR thanh toán PayOS cho đơn hàng.
 */
export async function createPayOSPaymentLinkController(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const orderId = parsePositiveIntegerPath(req.params.orderId);

    if (orderId === null) {
      return res.status(400).json({
        success: false,
        message: "Mã đơn hàng không hợp lệ",
      });
    }

    const data = await createPayOSPaymentLinkForOrder(orderId, userId);

    return res.json({
      success: true,
      message: "Tạo mã QR thanh toán PayOS thành công",
      data,
    });
  } catch (error) {
    return handlePayOSError(res, error, "initialization");
  }
}

/**
 * Route GET dùng để kiểm tra webhook endpoint có đang hoạt động không.
 * Endpoint - đường dẫn API.
 */
export async function payOSWebhookHealthController(
  _req: Request,
  res: Response
) {
  return res.status(200).json({
    success: true,
    message: "PayOS webhook endpoint is running",
  });
}

/**
 * Webhook PayOS.
 * Webhook là request PayOS gọi ngược về BE để báo thanh toán thành công/thất bại.
 *
 * Route này không dùng JWT. Mọi business callback phải được PayOS signature
 * verification xác thực trước khi service đọc hoặc mutate payment state.
 */
export async function payOSWebhookController(req: Request, res: Response) {
  try {
    const data = await handlePayOSWebhook(req.body, req.ip);

    return res.status(200).json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    return handlePayOSError(res, error, "webhook");
  }
}

/**
 * Customer kiểm tra trạng thái thanh toán PayOS của đơn hàng.
 */
export async function getPayOSPaymentStatusController(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const orderId = parsePositiveIntegerPath(req.params.orderId);

    if (orderId === null) {
      return res.status(400).json({
        success: false,
        message: "Mã đơn hàng không hợp lệ",
      });
    }

    const data = await getPayOSPaymentStatus(orderId, userId);

    return res.json({
      success: true,
      message: "Lấy trạng thái thanh toán PayOS thành công",
      data,
    });
  } catch (error) {
    return handlePayOSError(res, error, "status");
  }
}
