// src/modules/product-image/product-image.route.ts

import { Router } from "express";
import {
  createProductImageController,
  deleteProductImageController,
  getProductImagesController,
  setProductImageThumbnailController,
  updateProductImageController,
} from "./product-image.controller";
import { uploadImageMiddleware } from "../../middlewares/upload.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";

const productImageRouter = Router();

productImageRouter.get(
  "/products/:productId/images",
  getProductImagesController,
);

productImageRouter.post(
  "/products/:productId/images",
  authMiddleware,
  uploadImageMiddleware.single("file"),
  createProductImageController,
);

productImageRouter.patch(
  "/product-images/:imageId",
  authMiddleware,
  uploadImageMiddleware.single("file"),
  updateProductImageController,
);

productImageRouter.patch(
  "/product-images/:imageId/thumbnail",
  authMiddleware,
  setProductImageThumbnailController,
);

productImageRouter.delete(
  "/product-images/:imageId",
  authMiddleware,
  deleteProductImageController,
);

export default productImageRouter;