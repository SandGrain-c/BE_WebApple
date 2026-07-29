import { Request, Response } from "express";

import {
  adjustVariantStockService,
  AdminInventoryServiceError,
  createInventoryReceiptService,
  getInventoryReceiptDetailService,
  getInventoryReceiptsService,
  getInventoryVariantsService,
} from "./admin-inventory.service";

const getAdminUserIdFromRequest = (req: Request) => {
  return req.user?.userId ?? Number.NaN;
};

const handleAdminInventoryError = (res: Response, error: unknown) => {
  if (error instanceof AdminInventoryServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Xử lý tồn kho thất bại",
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
    const data = await getInventoryVariantsService(req.query);

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
    const data = await getInventoryReceiptsService(req.query);

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
      req.body
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
      req.body
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
