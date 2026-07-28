import { Request, Response } from "express";

import {
  AdminVoucherServiceError,
  createAdminVoucherService,
  deleteAdminVoucherService,
  getAdminVoucherDetailService,
  getAdminVouchersService,
  updateAdminVoucherService,
} from "./admin-voucher.service";
import {
  CreateAdminVoucherBody,
  GetAdminVouchersQuery,
  UpdateAdminVoucherBody,
} from "./admin-voucher.dto";

const handleAdminVoucherError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminVoucherServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý voucher thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

export const getAdminVouchersController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminVouchersService(
      req.query as GetAdminVouchersQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách voucher admin thành công",
      data,
    });
  } catch (error) {
    return handleAdminVoucherError(res, error);
  }
};

export const getAdminVoucherDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const voucherId = Number(req.params.voucherId);
    const data = await getAdminVoucherDetailService(voucherId);

    return res.json({
      success: true,
      message: "Lấy chi tiết voucher thành công",
      data,
    });
  } catch (error) {
    return handleAdminVoucherError(res, error);
  }
};

export const createAdminVoucherController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await createAdminVoucherService(
      req.body as CreateAdminVoucherBody
    );

    return res.status(201).json({
      success: true,
      message: "Tạo voucher thành công",
      data,
    });
  } catch (error) {
    return handleAdminVoucherError(res, error);
  }
};

export const updateAdminVoucherController = async (
  req: Request,
  res: Response
) => {
  try {
    const voucherId = Number(req.params.voucherId);

    const data = await updateAdminVoucherService(
      voucherId,
      req.body as UpdateAdminVoucherBody
    );

    return res.json({
      success: true,
      message: "Cập nhật voucher thành công",
      data,
    });
  } catch (error) {
    return handleAdminVoucherError(res, error);
  }
};

export const deleteAdminVoucherController = async (
  req: Request,
  res: Response
) => {
  try {
    const voucherId = Number(req.params.voucherId);
    const data = await deleteAdminVoucherService(voucherId);

    return res.json({
      success: true,
      message: "Xóa mềm voucher thành công",
      data,
    });
  } catch (error) {
    return handleAdminVoucherError(res, error);
  }
};