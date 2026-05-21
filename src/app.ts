// src/app.ts

import express from "express";
import cors from "cors";
import { env } from "./config/env";
import productImageRouter from "./modules/product-image/product-image.route";

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

export default app;