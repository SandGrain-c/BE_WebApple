import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { getAdminNotificationSummaryController } from "./admin-notification.controller";

const router = Router();

router.get(
  "/summary",
  authMiddleware,
  requireRoles(["Admin", "Staff", "WarehouseStaff"]),
  getAdminNotificationSummaryController
);

export default router;