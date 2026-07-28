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
router.use(authMiddleware);
router.use(requireRoles(["Admin"]));

router.get("/roles", getAdminRolesController);

router.get("/users", getAdminUsersController);
router.get("/users/:userId", getAdminUserDetailController);
router.post("/users", createAdminUserController);
router.patch("/users/:userId/status", updateUserStatusController);
router.patch("/users/:userId/role", updateUserRoleController);
router.patch("/users/:userId/password", resetUserPasswordController);

export default router;