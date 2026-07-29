import { Request, Response } from "express";

import {
  getAvailableVouchersService,
  validateVoucherService,
  VoucherServiceError,
} from "./voucher.service";

const getUserIdFromRequest = (req: Request) => {
  return req.user?.userId ?? Number.NaN;
};

const handleVoucherError = (res: Response, error: unknown) => {
  if (error instanceof VoucherServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("[voucher] unexpected validation error", error);

  return res.status(500).json({
    success: false,
    message: "Xử lý voucher thất bại",
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

    const data = await validateVoucherService(userId, req.body);

    return res.json({
      success: true,
      message: "Áp dụng mã giảm giá thành công",
      data,
    });
  } catch (error) {
    return handleVoucherError(res, error);
  }
};
