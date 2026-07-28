// src/modules/admin-supplier/admin-supplier.controller.ts

import type { Request, Response } from "express";
import {
  createAdminSupplier,
  deactivateAdminSupplier,
  getAdminSupplierById,
  getAdminSuppliers,
  updateAdminSupplier,
} from "./admin-supplier.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

function getActorId(req: Request) {
  // actorId: id admin/staff đang thao tác, lấy từ JWT sau authMiddleware
  return (req as any).user?.userId as number | undefined;
}

export async function getAdminSuppliersController(req: Request, res: Response) {
  try {
    const data = await getAdminSuppliers({
      search: req.query.search as string | undefined,
      status: req.query.status as any,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      sort: req.query.sort as any,
    });

    return res.json({
      success: true,
      message: "Lấy danh sách nhà cung cấp thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getAdminSupplierByIdController(
  req: Request,
  res: Response
) {
  try {
    const supplierId = Number(req.params.supplierId);
    const data = await getAdminSupplierById(supplierId);

    return res.json({
      success: true,
      message: "Lấy chi tiết nhà cung cấp thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function createAdminSupplierController(
  req: Request,
  res: Response
) {
  try {
    const data = await createAdminSupplier(
      req.body,
      getActorId(req),
      req.ip
    );

    return res.status(201).json({
      success: true,
      message: "Tạo nhà cung cấp thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function updateAdminSupplierController(
  req: Request,
  res: Response
) {
  try {
    const supplierId = Number(req.params.supplierId);

    const data = await updateAdminSupplier(
      supplierId,
      req.body,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Cập nhật nhà cung cấp thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function deleteAdminSupplierController(
  req: Request,
  res: Response
) {
  try {
    const supplierId = Number(req.params.supplierId);

    const data = await deactivateAdminSupplier(
      supplierId,
      getActorId(req),
      req.ip
    );

    return res.json({
      success: true,
      message: "Ngừng hoạt động nhà cung cấp thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}