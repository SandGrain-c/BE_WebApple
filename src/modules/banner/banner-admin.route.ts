import { Router } from "express";

import {
  createBannerController,
  deleteBannerController,
  getAdminBannersController,
  updateBannerController,
} from "./banner.controller";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { uploadImageMiddleware } from "../../middlewares/upload.middleware";

const router = Router();

const bannerManagerRoles = ["Admin", "Staff", "SaleStaff"];

/**
 * Các API bên dưới dùng cho Admin FE.
 *
 * authMiddleware:
 * - Kiểm tra user đã đăng nhập chưa.
 *
 * requireRoles:
 * - Kiểm tra user có quyền quản lý banner không.
 */
router.use(authMiddleware);
router.use(requireRoles(bannerManagerRoles));

/**
 * GET /api/admin/banners
 * Lấy danh sách banner cho admin.
 */
router.get("/", getAdminBannersController);

/**
 * POST /api/admin/banners
 * Tạo banner mới, có upload ảnh Cloudinary.
 *
 * form-data:
 * - file
 * - title
 * - targetUrl
 * - position
 * - isActive
 */
router.post("/", uploadImageMiddleware.single("file"), createBannerController);

/**
 * PATCH /api/admin/banners/:bannerId
 * Cập nhật banner, có thể thay ảnh mới.
 */
router.patch(
  "/:bannerId",
  uploadImageMiddleware.single("file"),
  updateBannerController
);

/**
 * DELETE /api/admin/banners/:bannerId
 * Xóa mềm banner.
 */
router.delete("/:bannerId", deleteBannerController);

export default router;