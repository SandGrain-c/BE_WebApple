import { Router } from "express";

import {
  createAdminVoucherController,
  deleteAdminVoucherController,
  getAdminVoucherDetailController,
  getAdminVouchersController,
  updateAdminVoucherController,
} from "./admin-voucher.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

const voucherManagerRoles = ["Admin", "Staff", "SaleStaff"];

router.use(authMiddleware);
router.use(requireRoles(voucherManagerRoles));

router.get("/", getAdminVouchersController);
router.get("/:voucherId", getAdminVoucherDetailController);
router.post("/", createAdminVoucherController);
router.patch("/:voucherId", updateAdminVoucherController);
router.delete("/:voucherId", deleteAdminVoucherController);

export default router;