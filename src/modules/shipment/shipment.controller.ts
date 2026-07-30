// src/modules/shipment/shipment.controller.ts

import type { NextFunction, Request, Response } from "express";
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
import { ShipmentServiceError } from "./shipment.error";
import { parsePositiveRouteId } from "./shipment.validation";

function getActorId(req: Request) {
  // user được authMiddleware gắn vào request sau khi verify JWT
  return req.user?.userId;
}

function getUserId(req: Request) {
  return req.user?.userId;
}

function handleShipmentError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof ShipmentServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
}

export async function getAdminShipmentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await getAdminShipments(req.query);

    return res.json({
      success: true,
      message: "Lấy danh sách vận chuyển thành công",
      data,
    });
  } catch (error) {
    return handleShipmentError(error, res, next);
  }
}

export async function getAdminShipmentByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const shipmentId = parsePositiveRouteId(
      req.params.shipmentId,
      "shipmentId",
    );
    const data = await getAdminShipmentById(shipmentId);

    return res.json({
      success: true,
      message: "Lấy chi tiết vận chuyển thành công",
      data,
    });
  } catch (error) {
    return handleShipmentError(error, res, next);
  }
}

export async function createAdminShipmentController(
  req: Request,
  res: Response,
  next: NextFunction,
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
    return handleShipmentError(error, res, next);
  }
}

export async function updateAdminShipmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const shipmentId = parsePositiveRouteId(
      req.params.shipmentId,
      "shipmentId",
    );

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
    return handleShipmentError(error, res, next);
  }
}

export async function updateAdminShipmentStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const shipmentId = parsePositiveRouteId(
      req.params.shipmentId,
      "shipmentId",
    );

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
    return handleShipmentError(error, res, next);
  }
}

export async function cancelAdminShipmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const shipmentId = parsePositiveRouteId(
      req.params.shipmentId,
      "shipmentId",
    );

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
    return handleShipmentError(error, res, next);
  }
}

export async function getCustomerShipmentByOrderIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const orderId = parsePositiveRouteId(req.params.orderId, "orderId");
    const data = await getCustomerShipmentByOrderId(orderId, userId);

    return res.json({
      success: true,
      message: "Lấy thông tin vận chuyển của đơn hàng thành công",
      data,
    });
  } catch (error) {
    return handleShipmentError(error, res, next);
  }
}

export async function getCustomerShipmentByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const shipmentId = parsePositiveRouteId(
      req.params.shipmentId,
      "shipmentId",
    );
    const data = await getCustomerShipmentById(shipmentId, userId);

    return res.json({
      success: true,
      message: "Lấy thông tin vận chuyển thành công",
      data,
    });
  } catch (error) {
    return handleShipmentError(error, res, next);
  }
}
