import { Router } from "express";

import {
  deleteAdminReviewController,
  getAdminReviewDetailController,
  getAdminReviewsController,
  updateReviewVisibilityController,
} from "./admin-review.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";

const router = Router();

const reviewManagerRoles = ["Admin", "Staff", "SaleStaff"];

router.use(authMiddleware);
router.use(requireRoles(reviewManagerRoles));

router.get("/", getAdminReviewsController);
router.get("/:reviewId", getAdminReviewDetailController);
router.patch("/:reviewId/visibility", updateReviewVisibilityController);
router.delete("/:reviewId", deleteAdminReviewController);

export default router;