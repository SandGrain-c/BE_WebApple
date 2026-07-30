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

const productReadRoles = ["Admin", "Staff", "WarehouseStaff"];
const productMutationRoles = ["Admin", "Staff"];

router.get(
  "/",
  authMiddleware,
  requireRoles(productReadRoles),
  getAdminProductsController,
);
router.get(
  "/:productId",
  authMiddleware,
  requireRoles(productReadRoles),
  getAdminProductDetailController,
);
router.post(
  "/",
  authMiddleware,
  requireRoles(productMutationRoles),
  createAdminProductController,
);
router.patch(
  "/:productId",
  authMiddleware,
  requireRoles(productMutationRoles),
  updateAdminProductController,
);
router.delete(
  "/:productId",
  authMiddleware,
  requireRoles(productMutationRoles),
  deleteAdminProductController,
);

export default router;
