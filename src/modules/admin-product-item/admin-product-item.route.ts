// src/modules/admin-product-item/admin-product-item.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import {
  createAdminProductItemController,
  deleteAdminProductItemController,
  getAdminProductItemDetailController,
  getAdminProductItemsController,
  updateAdminProductItemController,
} from "./admin-product-item.controller";

const router = Router();

/**
 * GET /api/admin/product-items
 * Lấy danh sách serial sản phẩm.
 */
router.get(
  "/",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  getAdminProductItemsController
);

/**
 * GET /api/admin/product-items/:productItemId
 * Lấy chi tiết serial sản phẩm.
 */
router.get(
  "/:productItemId",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  getAdminProductItemDetailController
);

/**
 * POST /api/admin/product-items
 * Tạo serial sản phẩm.
 */
router.post(
  "/",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  createAdminProductItemController
);

/**
 * PATCH /api/admin/product-items/:productItemId
 * Cập nhật serial sản phẩm.
 */
router.patch(
  "/:productItemId",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  updateAdminProductItemController
);

/**
 * DELETE /api/admin/product-items/:productItemId
 * Xóa mềm serial sản phẩm.
 */
router.delete(
  "/:productItemId",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  deleteAdminProductItemController
);

export default router;