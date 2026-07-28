import { Request, Response } from "express";

import {
  AdminAuditLogServiceError,
  getAdminAuditLogDetailService,
  getAdminAuditLogMetaService,
  getAdminAuditLogsService,
} from "./admin-audit-log.service";
import { GetAdminAuditLogsQuery } from "./admin-audit-log.dto";

/**
 * Xử lý lỗi chung cho Audit Log Controller.
 */
const handleAuditLogError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminAuditLogServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Xử lý audit log thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/audit-logs
 */
export const getAdminAuditLogsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getAdminAuditLogsService(
      req.query as GetAdminAuditLogsQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách audit log thành công",
      data,
    });
  } catch (error) {
    return handleAuditLogError(res, error);
  }
};

/**
 * GET /api/admin/audit-logs/:logId
 */
export const getAdminAuditLogDetailController = async (
  req: Request,
  res: Response
) => {
  try {
    const logId = Number(req.params.logId);
    const data = await getAdminAuditLogDetailService(logId);

    return res.json({
      success: true,
      message: "Lấy chi tiết audit log thành công",
      data,
    });
  } catch (error) {
    return handleAuditLogError(res, error);
  }
};

/**
 * GET /api/admin/audit-logs/meta
 */
export const getAdminAuditLogMetaController = async (
  _req: Request,
  res: Response
) => {
  try {
    const data = await getAdminAuditLogMetaService();

    return res.json({
      success: true,
      message: "Lấy metadata audit log thành công",
      data,
    });
  } catch (error) {
    return handleAuditLogError(res, error);
  }
};