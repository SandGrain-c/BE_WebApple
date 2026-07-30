// src/modules/product/product.route.ts

import { Router } from "express";
import {
  getProductDetailController,
  getProductsController,
  getProductSearchSuggestController
} from "./product.controller";

const productRoute = Router();

productRoute.get("/search-suggest", getProductSearchSuggestController);

productRoute.get("/", getProductsController);

productRoute.get("/:categorySlug/:productSlug", getProductDetailController);

export default productRoute;