// src/app.ts

import express from "express";
import cors from "cors";
import { env } from "./config/env";
import productImageRouter from "./modules/product-image/product-image.route";
import productRoute from "./modules/product/product.route";
import cartRoute from "./modules/cart/cart.route";
import authRoute from "./modules/auth/auth.route";
const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  });
});

app.use("/api", productImageRouter);
app.use("/api/products", productRoute);
app.use("/api/cart", cartRoute);
app.use("/api/auth", authRoute);
export default app;