// src/modules/shipment/shipment-customer.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  getCustomerShipmentByIdController,
  getCustomerShipmentByOrderIdController,
} from "./shipment.controller";

const router = Router();

// Customer phải đăng nhập mới xem được vận chuyển của đơn hàng
router.use(authMiddleware);

router.get("/orders/:orderId", getCustomerShipmentByOrderIdController);
router.get("/:shipmentId", getCustomerShipmentByIdController);

export default router;