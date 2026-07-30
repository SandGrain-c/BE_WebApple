// src/modules/admin-variant/admin-variant.service.ts

import prisma from "../../utils/prisma";
import {
  AdminVariantDto,
  CreateAdminVariantBody,
  UpdateAdminVariantBody,
} from "./admin-variant.dto";
import { mapAdminVariantToDto } from "./admin-variant.mapper";

export class AdminVariantServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Chuẩn hóa text: bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Chuyển giá trị sang number và kiểm tra hợp lệ.
 */
const normalizeNumber = (value: unknown, fieldName: string) => {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    throw new AdminVariantServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return numberValue;
};

/**
 * Kiểm tra product tồn tại.
 */
const ensureProductExists = async (productId: number) => {
  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
      name: true,
    },
  });

  if (!product) {
    throw new AdminVariantServiceError("Không tìm thấy sản phẩm", 404);
  }

  return product;
};

/**
 * Kiểm tra SKU không bị trùng.
 */
const ensureSkuUnique = async (sku: string, variantId?: number) => {
  const existedVariant = await prisma.product_variants.findFirst({
    where: {
      sku,
      ...(variantId
        ? {
            NOT: {
              variant_id: variantId,
            },
          }
        : {}),
    },
    select: {
      variant_id: true,
    },
  });

  if (existedVariant) {
    throw new AdminVariantServiceError("SKU đã tồn tại", 409);
  }
};

/**
 * Include chuẩn cho variant.
 */
const variantInclude = {
  products: {
    select: {
      product_id: true,
      name: true,
      slug: true,
    },
  },
};

/**
 * GET /api/admin/products/:productId/variants
 * Lấy danh sách variant theo product.
 */
export const getAdminVariantsByProductService = async (
  productId: number
): Promise<AdminVariantDto[]> => {
  if (!productId || Number.isNaN(productId)) {
    throw new AdminVariantServiceError("productId không hợp lệ", 400);
  }

  await ensureProductExists(productId);

  const variants = await prisma.product_variants.findMany({
    where: {
      product_id: productId,
    },
    orderBy: {
      variant_id: "asc",
    },
    include: variantInclude,
  });

  return variants.map(mapAdminVariantToDto);
};

/**
 * GET /api/admin/variants/:variantId
 * Lấy chi tiết variant.
 */
export const getAdminVariantDetailService = async (
  variantId: number
): Promise<AdminVariantDto> => {
  if (!variantId || Number.isNaN(variantId)) {
    throw new AdminVariantServiceError("variantId không hợp lệ", 400);
  }

  const variant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    include: variantInclude,
  });

  if (!variant) {
    throw new AdminVariantServiceError("Không tìm thấy biến thể sản phẩm", 404);
  }

  return mapAdminVariantToDto(variant);
};

/**
 * POST /api/admin/products/:productId/variants
 * Tạo variant cho product.
 */
export const createAdminVariantService = async (
  productId: number,
  body: CreateAdminVariantBody
): Promise<AdminVariantDto> => {
  if (!productId || Number.isNaN(productId)) {
    throw new AdminVariantServiceError("productId không hợp lệ", 400);
  }

  await ensureProductExists(productId);

  const sku = normalizeText(body.sku);

  if (!sku) {
    throw new AdminVariantServiceError("Vui lòng nhập SKU", 400);
  }

  await ensureSkuUnique(sku);

  const price = normalizeNumber(body.price, "Giá bán");

  if (price < 0) {
    throw new AdminVariantServiceError("Giá bán không được âm", 400);
  }

  const oldPrice =
    body.oldPrice === undefined || body.oldPrice === null
      ? null
      : normalizeNumber(body.oldPrice, "Giá cũ");

  if (oldPrice !== null && oldPrice < 0) {
    throw new AdminVariantServiceError("Giá cũ không được âm", 400);
  }

  const stockQuantity =
    body.stockQuantity === undefined
      ? 0
      : normalizeNumber(body.stockQuantity, "Tồn kho");

  if (stockQuantity < 0) {
    throw new AdminVariantServiceError("Tồn kho không được âm", 400);
  }

  const createdVariant = await prisma.product_variants.create({
    data: {
      product_id: productId,
      variant_name: normalizeText(body.variantName),
      sku,
      color: normalizeText(body.color),
      capacity: normalizeText(body.capacity),
      ram: normalizeText(body.ram),
      country: normalizeText(body.country),
      price,
      old_price: oldPrice,
      installment: normalizeText(body.installment),
      discount_label: normalizeText(body.discountLabel),
      stock_quantity: stockQuantity,
    },
    include: variantInclude,
  });

  return mapAdminVariantToDto(createdVariant);
};

/**
 * PATCH /api/admin/variants/:variantId
 * Cập nhật variant.
 */
export const updateAdminVariantService = async (
  variantId: number,
  body: UpdateAdminVariantBody
): Promise<AdminVariantDto> => {
  if (!variantId || Number.isNaN(variantId)) {
    throw new AdminVariantServiceError("variantId không hợp lệ", 400);
  }

  const existedVariant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    select: {
      variant_id: true,
    },
  });

  if (!existedVariant) {
    throw new AdminVariantServiceError("Không tìm thấy biến thể sản phẩm", 404);
  }

  const data: any = {};

  if (body.sku !== undefined) {
    const sku = normalizeText(body.sku);

    if (!sku) {
      throw new AdminVariantServiceError("SKU không được để trống", 400);
    }

    await ensureSkuUnique(sku, variantId);
    data.sku = sku;
  }

  if (body.variantName !== undefined) {
    data.variant_name = normalizeText(body.variantName);
  }

  if (body.color !== undefined) {
    data.color = normalizeText(body.color);
  }

  if (body.capacity !== undefined) {
    data.capacity = normalizeText(body.capacity);
  }

  if (body.ram !== undefined) {
    data.ram = normalizeText(body.ram);
  }

  if (body.country !== undefined) {
    data.country = normalizeText(body.country);
  }

  if (body.price !== undefined) {
    const price = normalizeNumber(body.price, "Giá bán");

    if (price < 0) {
      throw new AdminVariantServiceError("Giá bán không được âm", 400);
    }

    data.price = price;
  }

  if (body.oldPrice !== undefined) {
    const oldPrice =
      body.oldPrice === null ? null : normalizeNumber(body.oldPrice, "Giá cũ");

    if (oldPrice !== null && oldPrice < 0) {
      throw new AdminVariantServiceError("Giá cũ không được âm", 400);
    }

    data.old_price = oldPrice;
  }

  if (body.installment !== undefined) {
    data.installment = normalizeText(body.installment);
  }

  if (body.discountLabel !== undefined) {
    data.discount_label = normalizeText(body.discountLabel);
  }

  if (body.stockQuantity !== undefined) {
    const stockQuantity = normalizeNumber(body.stockQuantity, "Tồn kho");

    if (stockQuantity < 0) {
      throw new AdminVariantServiceError("Tồn kho không được âm", 400);
    }

    data.stock_quantity = stockQuantity;
  }

  const updatedVariant = await prisma.product_variants.update({
    where: {
      variant_id: variantId,
    },
    data,
    include: variantInclude,
  });

  return mapAdminVariantToDto(updatedVariant);
};

/**
 * Kiểm tra variant đã phát sinh dữ liệu liên quan chưa.
 * Nếu đã có order/cart/image/item thì không nên xóa cứng.
 */
const ensureVariantCanBeDeleted = async (variantId: number) => {
  const [
    cartItemCount,
    orderDetailCount,
    imageCount,
    productItemCount,
    flashSaleItemCount,
    inventoryReceiptDetailCount,
  ] = await Promise.all([
    prisma.cart_items.count({
      where: {
        variant_id: variantId,
      },
    }),
    prisma.order_details.count({
      where: {
        variant_id: variantId,
      },
    }),
    prisma.product_images.count({
      where: {
        variant_id: variantId,
      },
    }),
    prisma.product_items.count({
      where: {
        variant_id: variantId,
      },
    }),
    prisma.flash_sale_items.count({
      where: {
        variant_id: variantId,
      },
    }),
    prisma.inventory_receipt_details.count({
      where: {
        variant_id: variantId,
      },
    }),
  ]);

  const totalRelated =
    cartItemCount +
    orderDetailCount +
    imageCount +
    productItemCount +
    flashSaleItemCount +
    inventoryReceiptDetailCount;

  if (totalRelated > 0) {
    throw new AdminVariantServiceError(
      "Không thể xóa biến thể vì đã có dữ liệu liên quan. Nên cập nhật tồn kho về 0 hoặc thêm is_active cho variant ở bước nâng cấp sau.",
      409
    );
  }
};

/**
 * DELETE /api/admin/variants/:variantId
 * Xóa cứng variant nếu chưa phát sinh dữ liệu liên quan.
 */
export const deleteAdminVariantService = async (
  variantId: number
): Promise<AdminVariantDto> => {
  if (!variantId || Number.isNaN(variantId)) {
    throw new AdminVariantServiceError("variantId không hợp lệ", 400);
  }

  const existedVariant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    include: variantInclude,
  });

  if (!existedVariant) {
    throw new AdminVariantServiceError("Không tìm thấy biến thể sản phẩm", 404);
  }

  await ensureVariantCanBeDeleted(variantId);

  await prisma.product_variants.delete({
    where: {
      variant_id: variantId,
    },
  });

  return mapAdminVariantToDto(existedVariant);
};