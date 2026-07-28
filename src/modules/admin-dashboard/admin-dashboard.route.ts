import { Router } from "express";

import {
  getDashboardLowStockController,
  getDashboardOverviewController,
  getDashboardRecentOrdersController,
  getDashboardRevenueController,
  getDashboardTopProductsController,
} from "./admin-dashboard.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Dashboard API:
 * - Admin: xem toàn bộ
 * - Staff/SaleStaff: theo dõi bán hàng
 * - WarehouseStaff: theo dõi tồn kho
 */
const dashboardRoles = ["Admin", "Staff", "SaleStaff", "WarehouseStaff"];

router.use(authMiddleware);
router.use(requireRoles(dashboardRoles));

router.get("/overview", getDashboardOverviewController);
router.get("/revenue", getDashboardRevenueController);
router.get("/top-products", getDashboardTopProductsController);
router.get("/low-stock", getDashboardLowStockController);
router.get("/recent-orders", getDashboardRecentOrdersController);

export default router;