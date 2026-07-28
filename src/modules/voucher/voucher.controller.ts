import { Request, Response } from "express";

import {
  getAvailableVouchersService,
  validateVoucherService,
  VoucherServiceError,
} from "./voucher.service";
import { ValidateVoucherBody } from "./voucher.dto";

const getUserIdFromRequest = (req: Request) => {
  return Number((req as any).user?.userId);
};

const handleVoucherError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof VoucherServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý voucher thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

export const getAvailableVouchersController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);

    const subTotal =
      req.query.subTotal !== undefined
        ? Number(req.query.subTotal)
        : undefined;

    const data = await getAvailableVouchersService(userId, subTotal);

    return res.json({
      success: true,
      message: "Lấy danh sách voucher khả dụng thành công",
      data,
    });
  } catch (error) {
    return handleVoucherError(res, error);
  }
};

export const validateVoucherController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);

    const data = await validateVoucherService(
      userId,
      req.body as ValidateVoucherBody
    );

    return res.json({
      success: true,
      message: "Áp dụng mã giảm giá thành công",
      data,
    });
  } catch (error) {
    return handleVoucherError(res, error);
  }
};