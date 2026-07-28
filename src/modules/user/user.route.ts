// src/modules/user/user.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
    updateMyPasswordController,
    updateMyProfileController,
  } from "./user.controller";

const router = Router();

/**
 * PATCH /api/users/profile
 * User tự sửa thông tin cá nhân.
 */
router.patch("/profile", authMiddleware, updateMyProfileController);

/**
 * PATCH /api/users/password
 * User tự đổi mật khẩu.
 */
router.patch("/password", authMiddleware, updateMyPasswordController);

export default router;