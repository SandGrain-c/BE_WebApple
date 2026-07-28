import { Request, Response } from "express";

import {
  adjustVariantStockService,
  AdminInventoryServiceError,
  createInventoryReceiptService,
  getInventoryReceiptDetailService,
  getInventoryReceiptsService,
  getInventoryVariantsService,
} from "./admin-inventory.service";
import {
  AdjustStockBody,
  CreateInventoryReceiptBody,
  GetInventoryReceiptsQuery,
  GetInventoryVariantsQuery,
} from "./admin-inventory.dto";

const getAdminUserIdFromRequest = (req: Request) => {
  return Number((req as any).user?.userId);
};

const handleAdminInventoryError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminInventoryServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý kho hàng thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/inventory/variants
 */
export const getInventoryVariantsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getInventoryVariantsService(
      req.query as GetInventoryVariantsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách tồn kho thành công",
      data,
    });
  } catch (error) {
    return handleAdminInventoryError(res, error);
  }
};

/**
 * GET /api/admin/inventory/receipts
 */
export const getInventoryReceiptsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getInventoryReceiptsService(
      req.query as GetInventoryReceiptsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách phiếu nhập kho thành công",
      data,
    });
  } catch (error) {
    return handleAdminInventoryError(res, error);
  }
};

/**
 * GET /api/admin/inventory/receipts/:receiptId
 */
export const getInventoryReceiptDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const receiptId = Number(req.params.receiptId);
    const data = await getInventoryReceiptDetailService(receiptId);

    return res.json({
      success: true,
      message: "Lấy chi tiết phiếu nhập kho thành công",
      data,
    });
  } catch (error) {
    return handleAdminInventoryError(res, error);
  }
};

/**
 * POST /api/admin/inventory/receipts
 */
export const createInventoryReceiptController = async (
  req: Request,
  res: Response
) => {
  try {
    const warehouseStaffId = getAdminUserIdFromRequest(req);

    const data = await createInventoryReceiptService(
      warehouseStaffId,
      req.body as CreateInventoryReceiptBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo phiếu nhập kho thành công",
      data,
    });
  } catch (error) {
    return handleAdminInventoryError(res, error);
  }
};

/**
 * PATCH /api/admin/inventory/variants/:variantId/stock
 */
export const adjustVariantStockController = async (
  req: Request,
  res: Response
) => {
  try {
    const adminUserId = getAdminUserIdFromRequest(req);
    const variantId = Number(req.params.variantId);

    const data = await adjustVariantStockService(
      adminUserId,
      variantId,
      req.body as AdjustStockBody
    );

    return res.json({
      success: true,
      message: "Điều chỉnh tồn kho thành công",
      data,
    });
  } catch (error) {
    return handleAdminInventoryError(res, error);
  }
};