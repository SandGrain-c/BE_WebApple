import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  createPayOSPaymentLinkController,
  getPayOSPaymentStatusController,
  payOSWebhookController,
  payOSWebhookHealthController,
} from "./payos-payment.controller";
const router = Router();
router.get("/webhook", payOSWebhookHealthController);
/**
 * Webhook PayOS
 * Public route - route công khai
 * PayOS gọi vào route này, không có JWT token.
 */
router.post("/webhook", payOSWebhookController);

/**
 * Các route bên dưới mới cần đăng nhập customer.
 */
router.post(
  "/orders/:orderId/create-link",
  authMiddleware,
  createPayOSPaymentLinkController
);

router.get(
  "/orders/:orderId/status",
  authMiddleware,
  getPayOSPaymentStatusController
);

export default router;