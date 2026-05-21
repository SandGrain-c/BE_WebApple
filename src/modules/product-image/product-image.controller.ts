// src/modules/product-image/product-image.controller.ts

import { Request, Response, NextFunction } from "express";
import { createProductImageService } from "./product-image.service";

export const createProductImageController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const productId = Number(req.params.productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const variantId = req.body.variantId ? Number(req.body.variantId) : null;
    const color = req.body.color;
    const altText = req.body.altText;
    const isThumbnail = req.body.isThumbnail === "true";
    const sortOrder = req.body.sortOrder ? Number(req.body.sortOrder) : 0;

    if (!color) {
      return res.status(400).json({
        success: false,
        message: "Color is required",
      });
    }

    const productImage = await createProductImageService({
      productId,
      variantId,
      color,
      altText,
      isThumbnail,
      sortOrder,
      fileBuffer: req.file.buffer,
    });

    return res.status(201).json({
      success: true,
      message: "Create product image successfully",
      data: productImage,
    });
  } catch (error) {
    next(error);
  }
};