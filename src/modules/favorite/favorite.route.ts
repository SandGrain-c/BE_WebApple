import { Router } from "express";

import {
  addMyFavoriteController,
  checkMyFavoriteController,
  getMyFavoritesController,
  removeMyFavoriteController,
} from "./favorite.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả Favorite API đều yêu cầu đăng nhập.
 */
router.use(authMiddleware);

router.get("/", getMyFavoritesController);
router.get("/check/:productId", checkMyFavoriteController);
router.post("/:productId", addMyFavoriteController);
router.delete("/:productId", removeMyFavoriteController);

export default router;