import { Router } from "express";

import {
  getAdminAuditLogDetailController,
  getAdminAuditLogMetaController,
  getAdminAuditLogsController,
} from "./admin-audit-log.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Audit Log là dữ liệu nhạy cảm.
 * Chỉ Admin được xem.
 */
router.use(authMiddleware);
router.use(requireRoles(["Admin"]));

router.get("/", getAdminAuditLogsController);

/**
 * Route /meta phải đặt trước /:logId
 * để Express không hiểu "meta" là logId.
 */
router.get("/meta", getAdminAuditLogMetaController);

router.get("/:logId", getAdminAuditLogDetailController);

export default router;