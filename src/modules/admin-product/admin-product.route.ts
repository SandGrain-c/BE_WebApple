// src/modules/admin-product/admin-product.route.ts

import { Router } from "express";

import {
  createAdminProductController,
  deleteAdminProductController,
  getAdminProductDetailController,
  getAdminProductsController,
  updateAdminProductController,
} from "./admin-product.controller";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

const productManagerRoles = ["Admin", "Staff", "SaleStaff"];

/**
 * Tất cả Admin Product API đều yêu cầu:
 * - Đã đăng nhập
 * - Có role được phép quản lý sản phẩm
 */
router.use(authMiddleware);
router.use(requireRoles(productManagerRoles));

router.get("/", getAdminProductsController);
router.get("/:productId", getAdminProductDetailController);
router.post("/", createAdminProductController);
router.patch("/:productId", updateAdminProductController);
router.delete("/:productId", deleteAdminProductController);

export default router;