// src/modules/shipment/shipment.controller.ts

import type { Request, Response } from "express";
import {
  cancelAdminShipment,
  createAdminShipment,
  getAdminShipmentById,
  getAdminShipments,
  getCustomerShipmentById,
  getCustomerShipmentByOrderId,
  updateAdminShipment,
  updateAdminShipmentStatus,
} from "./shipment.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

function getActorId(req: Request) {
  // user được authMiddleware gắn vào request sau khi verify JWT
  return (req as any).user?.userId as number | undefined;
}

function getUserId(req: Request) {
  return (req as any).user?.userId as number | undefined;
}

export async function getAdminShipmentsController(req: Request, res: Response) {
  try {
    const data = await getAdminShipments({
      search: req.query.search as string | undefined,
      status: req.query.status as any,
      orderId: req.query.orderId ? Number(req.query.orderId) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      sort: req.query.sort as any,
    });

    return res.json({
      success: true,
      message: "Lấy danh sách vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getAdminShipmentByIdController(
  req: Request,
  res: Response
) {
  try {
    const shipmentId = Number(req.params.shipmentId);
    const data = await getAdminShipmentById(shipmentId);

    return res.json({
      success: true,
      message: "Lấy chi tiết vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function createAdminShipmentController(
  req: Request,
  res: Response
) {
  try {
    const data = await createAdminShipment(
      req.body,
      getActorId(req),
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: "Tạo thông tin vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function updateAdminShipmentController(
  req: Request,
  res: Response
) {
  try {
    const shipmentId = Number(req.params.shipmentId);

    const data = await updateAdminShipment(
      shipmentId,
      req.body,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Cập nhật vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function updateAdminShipmentStatusController(
  req: Request,
  res: Response
) {
  try {
    const shipmentId = Number(req.params.shipmentId);

    const data = await updateAdminShipmentStatus(
      shipmentId,
      req.body,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Cập nhật trạng thái vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function cancelAdminShipmentController(
  req: Request,
  res: Response
) {
  try {
    const shipmentId = Number(req.params.shipmentId);

    const data = await cancelAdminShipment(
      shipmentId,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Hủy vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCustomerShipmentByOrderIdController(
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
    const data = await getCustomerShipmentByOrderId(orderId, userId);

    return res.json({
      success: true,
      message: "Lấy thông tin vận chuyển của đơn hàng thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCustomerShipmentByIdController(
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

    const shipmentId = Number(req.params.shipmentId);
    const data = await getCustomerShipmentById(shipmentId, userId);

    return res.json({
      success: true,
      message: "Lấy thông tin vận chuyển thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}