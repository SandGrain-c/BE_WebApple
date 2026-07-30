import { Router } from "express";

import {
  adminLoginController,
  adminMeController,
} from "./admin-auth.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

const adminAndStaffRoles = [
  "Admin",
  "Staff",
  "SaleStaff",
  "WarehouseStaff",
  "AfterSalesStaff",
];

// Đăng nhập trang quản trị
router.post("/login", adminLoginController);

// Lấy thông tin admin hiện tại
router.get(
  "/me",
  authMiddleware,
  requireRoles(adminAndStaffRoles),
  adminMeController
);

export default router;