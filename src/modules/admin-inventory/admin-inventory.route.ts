import { Router } from "express";

import {
  adjustVariantStockController,
  createInventoryReceiptController,
  getInventoryReceiptDetailController,
  getInventoryReceiptsController,
  getInventoryVariantsController,
} from "./admin-inventory.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Inventory API:
 * - Admin: toàn quyền
 * - Staff: có thể hỗ trợ quản lý kho
 * - WarehouseStaff: nhân viên kho
 */
const inventoryManagerRoles = ["Admin", "Staff", "WarehouseStaff"];

router.use(authMiddleware);
router.use(requireRoles(inventoryManagerRoles));

router.get("/variants", getInventoryVariantsController);

router.get("/receipts", getInventoryReceiptsController);
router.get("/receipts/:receiptId", getInventoryReceiptDetailController);
router.post("/receipts", createInventoryReceiptController);

router.patch("/variants/:variantId/stock", adjustVariantStockController);

export default router;