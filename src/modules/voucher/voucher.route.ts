import { Router } from "express";

import {
  getAvailableVouchersController,
  validateVoucherController,
} from "./voucher.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/available", getAvailableVouchersController);
router.post("/validate", validateVoucherController);

export default router;