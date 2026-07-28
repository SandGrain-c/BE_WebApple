// src/modules/auth/auth.route.ts

import { Router } from "express";
import {
  getMeController,
  loginController,
  logoutController,
  registerController,
} from "./auth.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const authRoute = Router();

authRoute.post("/register", registerController);
authRoute.post("/login", loginController);
authRoute.get("/me", authMiddleware, getMeController);
authRoute.post("/logout", authMiddleware, logoutController);

export default authRoute;