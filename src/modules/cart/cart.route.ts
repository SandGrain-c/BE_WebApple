// src/modules/cart/cart.route.ts

import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  addCartItemController,
  clearCartController,
  getCartController,
  removeCartItemController,
  selectAllCartItemsController,
  updateCartItemQuantityController,
  updateCartItemSelectedController,
} from "./cart.controller";

const router = Router();

router.get("/", authMiddleware, getCartController);

router.post("/items", authMiddleware, addCartItemController);

router.patch(
  "/items/:cartItemId",
  authMiddleware,
  updateCartItemQuantityController
);

router.patch(
  "/items/:cartItemId/selected",
  authMiddleware,
  updateCartItemSelectedController
);

router.patch(
  "/select-all",
  authMiddleware,
  selectAllCartItemsController
);

router.delete(
  "/items/:cartItemId",
  authMiddleware,
  removeCartItemController
);

router.delete("/", authMiddleware, clearCartController);

export default router;