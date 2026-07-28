// src/modules/payment-transaction/payment-transaction-admin.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import {
  createAdminPaymentTransactionController,
  getAdminPaymentTransactionByIdController,
  getAdminPaymentTransactionsController,
  updateAdminPaymentTransactionStatusController,
} from "./payment-transaction.controller";

const router = Router();

// Authentication: xác thực đã đăng nhập
router.use(authMiddleware);

// Authorization: phân quyền theo role
router.use(requireRoles(["Admin", "Staff", "SaleStaff"]));

router.get("/", getAdminPaymentTransactionsController);
router.get("/:transactionId", getAdminPaymentTransactionByIdController);
router.post("/", createAdminPaymentTransactionController);
router.patch("/:transactionId/status", updateAdminPaymentTransactionStatusController);

export default router;