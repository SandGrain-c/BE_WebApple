// src/modules/payment-transaction/payos-payment.controller.ts

import type { Request, Response } from "express";
import {
  createPayOSPaymentLinkForOrder,
  getPayOSPaymentStatus,
  handlePayOSWebhook,
} from "./payos-payment.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

function getUserId(req: Request) {
  return (req as any).user?.userId as number | undefined;
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

    const orderId = Number(req.params.orderId);

    if (!orderId || orderId <= 0) {
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
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
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
 * Lưu ý:
 * - Route này KHÔNG được dùng authMiddleware.
 * - PayOS dashboard/Postman có thể gửi body rỗng hoặc body test.
 * - Body rỗng/test thì trả 200 để dashboard xác nhận URL đang sống.
 * - Webhook thật mới gọi handlePayOSWebhook để verify và update DB.
 */
export async function payOSWebhookController(req: Request, res: Response) {
  console.log("PAYOS WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

  try {
    const body = req.body;

    if (!body || Object.keys(body).length === 0 || body.test === true) {
      return res.status(200).json({
        success: true,
        message: "PayOS webhook endpoint is active",
      });
    }

    const data = await handlePayOSWebhook(body, req.ip);

    console.log("PAYOS WEBHOOK HANDLED:", data);

    return res.status(200).json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    console.error("PAYOS WEBHOOK ERROR:", error);

    const body = req.body;
    const message = getErrorMessage(error);

    /**
     * PayOS dashboard thường gửi webhook mẫu với orderCode = 123.
     * Đây không phải đơn thật trong DB.
     * Trả 200 để dashboard xác nhận URL hoạt động, nhưng không update DB.
     */
    const isPayOSWebhookShape =
      body &&
      typeof body === "object" &&
      "code" in body &&
      "desc" in body &&
      "data" in body &&
      "signature" in body;

    const isDashboardTestWebhook =
      isPayOSWebhookShape &&
      Number(body?.data?.orderCode) === 123 &&
      Number(body?.data?.amount) === 3000 &&
      body?.data?.reference === "TF230204212323";

    if (isDashboardTestWebhook) {
      return res.status(200).json({
        success: true,
        message: "PayOS dashboard webhook test received",
      });
    }

    return res.status(400).json({
      success: false,
      message,
    });
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

    const orderId = Number(req.params.orderId);

    if (!orderId || orderId <= 0) {
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
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}