import { Router } from "express";

import {
  createAdminUserController,
  getAdminRolesController,
  getAdminUserDetailController,
  getAdminUsersController,
  resetUserPasswordController,
  updateUserRoleController,
  updateUserStatusController,
} from "./admin-user.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * User Management là chức năng nhạy cảm.
 * Chỉ Admin được quản lý tài khoản và role.
 */
const adminOnly = requireRoles(["Admin"]);

router.get("/roles", authMiddleware, adminOnly, getAdminRolesController);

router.get("/users", authMiddleware, adminOnly, getAdminUsersController);
router.get(
  "/users/:userId",
  authMiddleware,
  adminOnly,
  getAdminUserDetailController,
);
router.post("/users", authMiddleware, adminOnly, createAdminUserController);
router.patch(
  "/users/:userId/status",
  authMiddleware,
  adminOnly,
  updateUserStatusController,
);
router.patch(
  "/users/:userId/role",
  authMiddleware,
  adminOnly,
  updateUserRoleController,
);
router.patch(
  "/users/:userId/password",
  authMiddleware,
  adminOnly,
  resetUserPasswordController,
);

export default router;
