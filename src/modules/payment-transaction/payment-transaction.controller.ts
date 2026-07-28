// src/modules/payment-transaction/payment-transaction.controller.ts

import type { Request, Response } from "express";
import {
  createAdminPaymentTransaction,
  getAdminPaymentTransactionById,
  getAdminPaymentTransactions,
  getCustomerPaymentTransactionById,
  getCustomerPaymentTransactionsByOrderId,
  updateAdminPaymentTransactionStatus,
} from "./payment-transaction.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

function getActorId(req: Request) {
  // authMiddleware gắn user vào req sau khi verify JWT
  return (req as any).user?.userId as number | undefined;
}

function getUserId(req: Request) {
  return (req as any).user?.userId as number | undefined;
}

export async function getAdminPaymentTransactionsController(
  req: Request,
  res: Response
) {
  try {
    const data = await getAdminPaymentTransactions({
      search: req.query.search as string | undefined,
      orderId: req.query.orderId ? Number(req.query.orderId) : undefined,
      gateway: req.query.gateway as string | undefined,
      paymentType: req.query.paymentType as any,
      status: req.query.status as any,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      sort: req.query.sort as any,
    });

    return res.json({
      success: true,
      message: "Lấy danh sách giao dịch thanh toán thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getAdminPaymentTransactionByIdController(
  req: Request,
  res: Response
) {
  try {
    const transactionId = Number(req.params.transactionId);
    const data = await getAdminPaymentTransactionById(transactionId);

    return res.json({
      success: true,
      message: "Lấy chi tiết giao dịch thanh toán thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function createAdminPaymentTransactionController(
  req: Request,
  res: Response
) {
  try {
    const data = await createAdminPaymentTransaction(
      req.body,
      getActorId(req),
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: "Tạo giao dịch thanh toán thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function updateAdminPaymentTransactionStatusController(
  req: Request,
  res: Response
) {
  try {
    const transactionId = Number(req.params.transactionId);

    const data = await updateAdminPaymentTransactionStatus(
      transactionId,
      req.body,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Cập nhật trạng thái giao dịch thanh toán thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCustomerPaymentTransactionsByOrderIdController(
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
    const data = await getCustomerPaymentTransactionsByOrderId(orderId, userId);

    return res.json({
      success: true,
      message: "Lấy giao dịch thanh toán của đơn hàng thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCustomerPaymentTransactionByIdController(
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

    const transactionId = Number(req.params.transactionId);
    const data = await getCustomerPaymentTransactionById(transactionId, userId);

    return res.json({
      success: true,
      message: "Lấy chi tiết giao dịch thanh toán thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}