// src/modules/admin-notification/admin-notification.controller.ts

import type { Request, Response } from "express";
import { getAdminNotificationSummaryService } from "./admin-notification.service";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi hệ thống";
}

/**
 * GET /api/admin/notifications/summary
 * Lấy số lượng badge/thông báo cho Admin.
 */
export async function getAdminNotificationSummaryController(
  _req: Request,
  res: Response
) {
  try {
    const data = await getAdminNotificationSummaryService();

    return res.json({
      success: true,
      message: "Lấy tổng quan thông báo admin thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}