// src/modules/admin-category/admin-category.route.ts

import { Router } from "express";

import {
  createAdminCategoryController,
  deleteAdminCategoryController,
  getAdminCategoriesController,
  getAdminCategoryDetailController,
  updateAdminCategoryController,
} from "./admin-category.controller";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Category là dữ liệu nền tảng của hệ thống.
 * Tạm thời chỉ cho Admin quản lý để an toàn.
 */
const categoryManagerRoles = ["Admin"];

router.use(authMiddleware);
router.use(requireRoles(categoryManagerRoles));

router.get("/", getAdminCategoriesController);
router.get("/:categoryId", getAdminCategoryDetailController);
router.post("/", createAdminCategoryController);
router.patch("/:categoryId", updateAdminCategoryController);
router.delete("/:categoryId", deleteAdminCategoryController);

export default router;