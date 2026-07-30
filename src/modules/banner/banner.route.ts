// src/modules/banner/banner.route.ts

import { Router } from "express";
import {
  createBannerController,
  deleteBannerController,
  getAdminBannersController,
  getPublicBannersController,
  updateBannerController,
} from "./banner.controller";
import { uploadImageMiddleware } from "../../middlewares/upload.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";

const bannerRoute = Router();

bannerRoute.get("/", getPublicBannersController);

bannerRoute.get("/admin", authMiddleware, getAdminBannersController);

bannerRoute.post(
  "/",
  authMiddleware,
  uploadImageMiddleware.single("file"),
  createBannerController,
);

bannerRoute.patch(
  "/:bannerId",
  authMiddleware,
  uploadImageMiddleware.single("file"),
  updateBannerController,
);

bannerRoute.delete("/:bannerId", authMiddleware, deleteBannerController);

export default bannerRoute;