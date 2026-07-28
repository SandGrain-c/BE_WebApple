// src/modules/shipment/shipment-admin.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import {
  cancelAdminShipmentController,
  createAdminShipmentController,
  getAdminShipmentByIdController,
  getAdminShipmentsController,
  updateAdminShipmentController,
  updateAdminShipmentStatusController,
} from "./shipment.controller";

const router = Router();

// Middleware: lớp xử lý trung gian, kiểm tra đăng nhập trước khi vào controller
router.use(authMiddleware);

// Authorization: phân quyền theo vai trò
router.use(requireRoles(["Admin", "Staff", "SaleStaff", "WarehouseStaff"]));

router.get("/", getAdminShipmentsController);
router.get("/:shipmentId", getAdminShipmentByIdController);
router.post("/", createAdminShipmentController);
router.patch("/:shipmentId", updateAdminShipmentController);
router.patch("/:shipmentId/status", updateAdminShipmentStatusController);

// Không xóa cứng shipment, chỉ chuyển status = Cancelled
router.delete("/:shipmentId", cancelAdminShipmentController);

export default router;