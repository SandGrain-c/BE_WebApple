import { Router } from "express";

import {
    createManyProductImagesController,
    createProductImageController,
    deleteProductImageController,
    getProductImagesController,
    setProductImageThumbnailController,
    updateProductImageController,
  } from "./product-image.controller";

import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { uploadImageMiddleware } from "../../middlewares/upload.middleware";

const router = Router();

const productImageManagerRoles = ["Admin", "Staff"];

/**
 * Product Image Admin API
 *
 * Dùng cho Admin FE quản lý ảnh sản phẩm.
 */
/**
 * GET /api/admin/products/:productId/images
 * Lấy danh sách ảnh sản phẩm cho admin.
 */
router.get(
  "/products/:productId/images",
  authMiddleware,
  requireRoles(productImageManagerRoles),
  getProductImagesController,
);

/**
 * POST /api/admin/products/:productId/images
 * Upload ảnh sản phẩm mới.
 */
router.post(
  "/products/:productId/images",
  authMiddleware,
  requireRoles(productImageManagerRoles),
  uploadImageMiddleware.single("file"),
  createProductImageController
);

/**
 * PATCH /api/admin/product-images/:imageId
 * Cập nhật metadata hoặc thay file ảnh.
 */
router.patch(
  "/product-images/:imageId",
  authMiddleware,
  requireRoles(productImageManagerRoles),
  uploadImageMiddleware.single("file"),
  updateProductImageController
);

/**
 * PATCH /api/admin/product-images/:imageId/thumbnail
 * Đặt ảnh làm thumbnail.
 */
router.patch(
  "/product-images/:imageId/thumbnail",
  authMiddleware,
  requireRoles(productImageManagerRoles),
  setProductImageThumbnailController
);

/**
 * DELETE /api/admin/product-images/:imageId
 * Xóa mềm ảnh sản phẩm.
 */
router.delete(
  "/product-images/:imageId",
  authMiddleware,
  requireRoles(productImageManagerRoles),
  deleteProductImageController,
);


/**
 * POST /api/admin/products/:productId/images/bulk
 * Upload nhiều ảnh sản phẩm.
 *
 * form-data:
 * - files: nhiều ảnh
 * - variantId
 * - color
 * - altText
 * - thumbnailIndex
 * - sortOrderStart
 * - isActive
 */
router.post(
    "/products/:productId/images/bulk",
    authMiddleware,
    requireRoles(productImageManagerRoles),
    uploadImageMiddleware.array("files", 10),
    createManyProductImagesController
  );
export default router;
