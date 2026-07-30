// src/modules/admin-staff/admin-staff.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { STAFF_MANAGEMENT_ROLES } from "../../constants/role.constant";
import {
  createAdminStaffController,
  getAdminStaffDetailController,
  getAdminStaffListController,
  getAdminStaffRolesController,
  resetAdminStaffPasswordController,
  updateAdminStaffController,
  updateAdminStaffRoleController,
  updateAdminStaffStatusController,
} from "./admin-staff.controller";

const router = Router();

/**
 * Tất cả API quản lý nhân viên chỉ cho Admin.
 */
router.use(authMiddleware);
router.use(requireRoles(STAFF_MANAGEMENT_ROLES));

/**
 * GET /api/admin/staff/roles
 * Lấy danh sách role và quyền tương ứng để FE hiển thị menu/quyền.
 *
 * Đặt trước "/:userId" để tránh Express hiểu roles là userId.
 */
router.get("/roles", getAdminStaffRolesController);

/**
 * GET /api/admin/staff
 * Lấy danh sách nhân viên.
 */
router.get("/", getAdminStaffListController);

/**
 * POST /api/admin/staff
 * Tạo tài khoản nhân viên kèm hồ sơ staff_profiles.
 */
router.post("/", createAdminStaffController);

/**
 * GET /api/admin/staff/:userId
 * Lấy chi tiết nhân viên.
 */
router.get("/:userId", getAdminStaffDetailController);

/**
 * PATCH /api/admin/staff/:userId
 * Cập nhật thông tin tài khoản + hồ sơ nhân viên.
 */
router.patch("/:userId", updateAdminStaffController);

/**
 * PATCH /api/admin/staff/:userId/status
 * Khóa/mở khóa tài khoản nhân viên.
 */
router.patch("/:userId/status", updateAdminStaffStatusController);

/**
 * PATCH /api/admin/staff/:userId/role
 * Đổi role nhân viên.
 */
router.patch("/:userId/role", updateAdminStaffRoleController);

/**
 * PATCH /api/admin/staff/:userId/password
 * Admin reset mật khẩu nhân viên.
 */
router.patch("/:userId/password", resetAdminStaffPasswordController);

export default router;
