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

const variantReadRoles = ["Admin", "Staff", "WarehouseStaff"];
const variantMutationRoles = ["Admin", "Staff"];

router.get(
  "/products/:productId/variants",
  authMiddleware,
  requireRoles(variantReadRoles),
  getAdminVariantsByProductController,
);
router.post(
  "/products/:productId/variants",
  authMiddleware,
  requireRoles(variantMutationRoles),
  createAdminVariantController,
);

router.get(
  "/variants/:variantId",
  authMiddleware,
  requireRoles(variantReadRoles),
  getAdminVariantDetailController,
);
router.patch(
  "/variants/:variantId",
  authMiddleware,
  requireRoles(variantMutationRoles),
  updateAdminVariantController,
);
router.delete(
  "/variants/:variantId",
  authMiddleware,
  requireRoles(variantMutationRoles),
  deleteAdminVariantController,
);

export default router;
