// src/modules/admin-variant/admin-variant.route.ts

import { Router } from "express";

import {
  createAdminVariantController,
  deleteAdminVariantController,
  getAdminVariantDetailController,
  getAdminVariantsByProductController,
  updateAdminVariantController,
} from "./admin-variant.controller";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

const variantManagerRoles = ["Admin", "Staff", "SaleStaff", "WarehouseStaff"];

/**
 * Tất cả Admin Variant API đều yêu cầu:
 * - Đã đăng nhập
 * - Có quyền quản lý sản phẩm/kho
 */
router.use(authMiddleware);
router.use(requireRoles(variantManagerRoles));

router.get("/products/:productId/variants", getAdminVariantsByProductController);
router.post("/products/:productId/variants", createAdminVariantController);

router.get("/variants/:variantId", getAdminVariantDetailController);
router.patch("/variants/:variantId", updateAdminVariantController);
router.delete("/variants/:variantId", deleteAdminVariantController);

export default router;