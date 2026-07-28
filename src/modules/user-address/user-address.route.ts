// src/modules/user-address/use-address.route.ts

import { Router } from "express";

import {
  createMyAddressController,
  deleteMyAddressController,
  getMyAddressDetailController,
  getMyAddressesController,
  setDefaultMyAddressController,
  updateMyAddressController,
} from "./user-address.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả User Address API đều yêu cầu đăng nhập.
 */
router.use(authMiddleware);

router.get("/", getMyAddressesController);
router.post("/", createMyAddressController);
router.get("/:addressId", getMyAddressDetailController);
router.patch("/:addressId", updateMyAddressController);
router.patch("/:addressId/default", setDefaultMyAddressController);
router.delete("/:addressId", deleteMyAddressController);

export default router;