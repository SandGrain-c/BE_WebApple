// src/modules/admin-supplier/admin-supplier.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import {
  createAdminSupplierController,
  deleteAdminSupplierController,
  getAdminSupplierByIdController,
  getAdminSuppliersController,
  updateAdminSupplierController,
} from "./admin-supplier.controller";

const router = Router();

// Tất cả Supplier API đều yêu cầu đăng nhập.
router.use(authMiddleware);

// Authorization: phân quyền theo role
router.use(requireRoles(["Admin", "WarehouseStaff"]));

router.get("/", getAdminSuppliersController);
router.get("/:supplierId", getAdminSupplierByIdController);
router.post("/", createAdminSupplierController);
router.patch("/:supplierId", updateAdminSupplierController);
router.delete("/:supplierId", deleteAdminSupplierController);

export default router;
