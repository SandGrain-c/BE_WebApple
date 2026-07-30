import { Request, Response } from "express";

import {
  AdminDashboardServiceError,
  getDashboardLowStockService,
  getDashboardOverviewService,
  getDashboardRecentOrdersService,
  getDashboardRevenueService,
  getDashboardTopProductsService,
} from "./admin-dashboard.service";
import {
  DashboardLowStockQuery,
  DashboardRecentOrdersQuery,
  DashboardRevenueQuery,
  DashboardTopProductsQuery,
} from "./admin-dashboard.dto";

const handleDashboardError = (res: Response, error: unknown) => {
  const statusCode =
    error instanceof AdminDashboardServiceError ? error.statusCode : 500;

  const message =
    error instanceof Error ? error.message : "Lấy thống kê dashboard thất bại";

  return res.status(statusCode).json({
    success: false,
    message,
  });
};

/**
 * GET /api/admin/dashboard/overview
 */
export const getDashboardOverviewController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getDashboardOverviewService(
      req.query as DashboardRevenueQuery
    );

    return res.json({
      success: true,
      message: "Lấy tổng quan dashboard thành công",
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

/**
 * GET /api/admin/dashboard/revenue
 */
export const getDashboardRevenueController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getDashboardRevenueService(
      req.query as DashboardRevenueQuery
    );

    return res.json({
      success: true,
      message: "Lấy biểu đồ doanh thu thành công",
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

/**
 * GET /api/admin/dashboard/top-products
 */
export const getDashboardTopProductsController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getDashboardTopProductsService(
      req.query as DashboardTopProductsQuery
    );

    return res.json({
      success: true,
      message: "Lấy sản phẩm bán chạy thành công",
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

/**
 * GET /api/admin/dashboard/low-stock
 */
export const getDashboardLowStockController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getDashboardLowStockService(
      req.query as DashboardLowStockQuery
    );

    return res.json({
      success: true,
      message: "Lấy danh sách tồn kho thấp thành công",
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

/**
 * GET /api/admin/dashboard/recent-orders
 */
export const getDashboardRecentOrdersController = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getDashboardRecentOrdersService(
      req.query as DashboardRecentOrdersQuery
    );

    return res.json({
      success: true,
      message: "Lấy đơn hàng gần đây thành công",
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};