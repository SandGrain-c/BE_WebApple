// src/modules/admin-order/admin-order.route.ts

import { Router } from "express";

import {
  getAdminOrderDetailController,
  getAdminOrdersController,
  updateAdminOrderStatusController,
  expirePendingPaymentsController,
} from "./admin-order.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Admin Order Management:
 * - Admin: toàn quyền
 * - Staff/SaleStaff: xử lý đơn bán hàng
 * - WarehouseStaff: cập nhật vận chuyển qua Shipment API
 */
const orderManagerRoles = [
  "Admin",
  "Staff",
  "SaleStaff",
];

router.use(authMiddleware);
router.use(requireRoles(orderManagerRoles));
router.post(
  "/expire-pending-payments",
  authMiddleware,
  // roleMiddleware(["Admin", "Staff"]),
  expirePendingPaymentsController
);
router.get("/", getAdminOrdersController);
router.get("/:orderId", getAdminOrderDetailController);
router.patch("/:orderId/status", updateAdminOrderStatusController);

export default router;
