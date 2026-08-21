// src/modules/auth/auth.route.ts

import { Router } from "express";
import {
  forgotPasswordController,
  getMeController,
  loginController,
  logoutController,
  registerController,
  resetPasswordController,
} from "./auth.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { passwordResetRateLimiter } from "../../middlewares/password-reset-rate-limit.middleware";

const authRoute = Router();

authRoute.post("/register", registerController);
authRoute.post("/login", loginController);
authRoute.post(
  "/forgot-password",
  passwordResetRateLimiter,
  forgotPasswordController,
);
authRoute.post("/reset-password", resetPasswordController);
authRoute.get("/me", authMiddleware, getMeController);
authRoute.post("/logout", authMiddleware, logoutController);

export default authRoute;
