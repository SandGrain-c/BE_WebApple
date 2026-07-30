// src/modules/product/product.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  getProductsService,
  getProductDetailService,
  getProductSearchSuggestService
} from "./product.service";
import {
  parseProductCatalogQuery,
  ProductCatalogQueryError,
} from "./product-catalog.query";

export const getProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = parseProductCatalogQuery(req.query);
    const data = await getProductsService(query);

    return res.status(200).json({
      success: true,
      message: "Get products successfully",
      data,
    });
  } catch (error) {
    if (error instanceof ProductCatalogQueryError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

export const getProductDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const categorySlugParam = req.params.categorySlug;
    const productSlugParam = req.params.productSlug;

    if (
      typeof categorySlugParam !== "string" ||
      typeof productSlugParam !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "categorySlug hoặc productSlug không hợp lệ",
      });
    }

    const data = await getProductDetailService(
      categorySlugParam,
      productSlugParam,
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết sản phẩm thành công",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/search-suggest
 * Lấy gợi ý tìm kiếm sản phẩm cho Header.
 */
export const getProductSearchSuggestController = async (req: any, res: any) => {
  try {
    const data = await getProductSearchSuggestService(req.query);

    return res.status(200).json({
      success: true,
      message: "Lấy gợi ý tìm kiếm sản phẩm thành công",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Lấy gợi ý tìm kiếm sản phẩm thất bại",
    });
  }
};
