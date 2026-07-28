// src/modules/banner/banner-public.route.ts

import { Router } from "express";

import { getPublicBannersController } from "./banner.controller";

const router = Router();

/**
 * Public Banner API
 * Dùng cho Customer FE hiển thị banner.
 *
 * GET /api/banners
 * GET /api/banners?position=home-hero
 */
router.get("/", getPublicBannersController);

export default router;