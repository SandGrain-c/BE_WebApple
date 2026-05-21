// src/modules/product-image/product-image.route.ts

import { Router } from "express";
import { uploadImageMiddleware } from "../../middlewares/upload.middleware";
import { createProductImageController } from "./product-image.controller";

const productImageRouter = Router();

productImageRouter.post(
  "/products/:productId/images",
  uploadImageMiddleware.single("file"),
  createProductImageController
);

export default productImageRouter;