// src/modules/payment-transaction/payment-transaction-customer.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  getCustomerPaymentTransactionByIdController,
  getCustomerPaymentTransactionsByOrderIdController,
} from "./payment-transaction.controller";

const router = Router();

// Customer phải đăng nhập mới xem được giao dịch của đơn hàng
router.use(authMiddleware);

router.get("/orders/:orderId", getCustomerPaymentTransactionsByOrderIdController);
router.get("/:transactionId", getCustomerPaymentTransactionByIdController);

export default router;