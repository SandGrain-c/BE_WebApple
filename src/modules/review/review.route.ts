import { Router } from "express";

import {
  createReviewController,
  deleteMyReviewController,
  getProductReviewsController,
  updateMyReviewController,
} from "./review.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Public API:
 * Ai cũng có thể xem review sản phẩm.
 */
router.get("/products/:productId/reviews", getProductReviewsController);

/**
 * Customer API:
 * Tạo/sửa/xóa review cần đăng nhập.
 */
router.post("/reviews", authMiddleware, createReviewController);
router.patch("/reviews/:reviewId", authMiddleware, updateMyReviewController);
router.delete("/reviews/:reviewId", authMiddleware, deleteMyReviewController);

export default router;