// src/modules/order/order.route.ts

import { Router } from "express";

import {
  cancelMyOrderController,
  checkoutController,
  getMyOrderDetailController,
  getMyOrdersController,
} from "./order.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả Customer Order API đều yêu cầu đăng nhập.
 */
router.use(authMiddleware);

/**
 * POST /api/orders/checkout
 * Tạo đơn hàng từ giỏ hàng.
 */
router.post("/checkout", checkoutController);

/**
 * GET /api/orders
 * Lấy lịch sử đơn hàng.
 */
router.get("/", getMyOrdersController);

/**
 * GET /api/orders/:orderId
 * Lấy chi tiết đơn hàng.
 */
router.get("/:orderId", getMyOrderDetailController);

/**
 * PATCH /api/orders/:orderId/cancel
 * Khách hàng hủy đơn.
 */
router.patch("/:orderId/cancel", cancelMyOrderController);

export default router;