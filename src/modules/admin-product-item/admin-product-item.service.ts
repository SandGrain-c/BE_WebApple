// src/modules/admin-product-item/admin-product-item.service.ts

import prisma from "../../utils/prisma";
import type {
  AdminProductItemDto,
  AdminProductItemListResponseDto,
  CreateProductItemBody,
  GetAdminProductItemsQuery,
  ProductItemStatus,
  UpdateProductItemBody,
} from "./admin-product-item.dto";
import { mapAdminProductItemToDto } from "./admin-product-item.mapper";

export class AdminProductItemServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * DB product_items.status đang lưu dạng number.
 * API vẫn nhận/trả status dạng chữ để FE dễ dùng.
 */
const PRODUCT_ITEM_STATUS_TO_DB: Record<ProductItemStatus, number> = {
  InStock: 1,
  Reserved: 2,
  Sold: 3,
  Warranty: 4,
  Returned: 5,
  Inactive: 6,
};

const PRODUCT_ITEM_STATUSES = Object.keys(
  PRODUCT_ITEM_STATUS_TO_DB
) as ProductItemStatus[];

const productItemInclude = {
  product_variants: {
    include: {
      products: {
        include: {
          categories: true,
        },
      },
    },
  },
};

const normalizeText = (value?: string | null) => {
  const text = value?.trim();

  return text ? text : null;
};

const parsePositiveInt = (value: unknown) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
};

const parsePage = (value: unknown) => {
  const page = Number(value) || 1;

  if (!Number.isInteger(page) || page <= 0) {
    return 1;
  }

  return page;
};

const parseLimit = (value: unknown) => {
  const limit = Number(value) || 10;

  if (!Number.isInteger(limit) || limit <= 0) {
    return 10;
  }

  return Math.min(limit, 100);
};

/**
 * Convert status từ API dạng string sang DB dạng number.
 */
const parseStatusToDb = (status?: string | null): number | null => {
  if (!status) {
    return null;
  }

  if (!PRODUCT_ITEM_STATUSES.includes(status as ProductItemStatus)) {
    throw new AdminProductItemServiceError(
      "Trạng thái serial sản phẩm không hợp lệ",
      400
    );
  }

  return PRODUCT_ITEM_STATUS_TO_DB[status as ProductItemStatus];
};

const ensureVariantExists = async (variantId: number) => {
  const variant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    include: {
      products: true,
    },
  });

  if (!variant) {
    throw new AdminProductItemServiceError(
      "Không tìm thấy phiên bản sản phẩm",
      404
    );
  }

  if (!variant.products.is_active) {
    throw new AdminProductItemServiceError(
      "Sản phẩm của phiên bản này đang ngừng hoạt động",
      400
    );
  }

  return variant;
};

const ensureSerialNumberProvided = (serialNumber: string | null): string => {
  if (!serialNumber) {
    throw new AdminProductItemServiceError("Vui lòng nhập serialNumber", 400);
  }

  return serialNumber;
};

const ensureUniqueSerial = async (
  serialNumber: string,
  ignoreProductItemId?: number
) => {
  const existedSerial = await prisma.product_items.findFirst({
    where: {
      serial_number: serialNumber,
      ...(ignoreProductItemId
        ? {
            NOT: {
              item_id: ignoreProductItemId,
            },
          }
        : {}),
    },
  });

  if (existedSerial) {
    throw new AdminProductItemServiceError("Serial đã tồn tại", 409);
  }
};

export const getAdminProductItemsService = async (
  query: GetAdminProductItemsQuery
): Promise<AdminProductItemListResponseDto> => {
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);
  const skip = (page - 1) * limit;

  const keyword = normalizeText(query.q);
  const status = parseStatusToDb(query.status);
  const variantId = parsePositiveInt(query.variantId);
  const productId = parsePositiveInt(query.productId);

  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (variantId) {
    where.variant_id = variantId;
  }

  if (productId) {
    where.product_variants = {
      products: {
        product_id: productId,
      },
    };
  }

  if (keyword) {
    where.OR = [
      {
        serial_number: {
          contains: keyword,
          mode: "insensitive",
        },
      },
      {
        product_variants: {
          sku: {
            contains: keyword,
            mode: "insensitive",
          },
        },
      },
      {
        product_variants: {
          products: {
            name: {
              contains: keyword,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  const [items, totalItems] = await Promise.all([
    prisma.product_items.findMany({
      where,
      include: productItemInclude,
      orderBy: {
        item_id: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.product_items.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminProductItemToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getAdminProductItemDetailService = async (
  productItemId: number
): Promise<AdminProductItemDto> => {
  const item = await prisma.product_items.findUnique({
    where: {
      item_id: productItemId,
    },
    include: productItemInclude,
  });

  if (!item) {
    throw new AdminProductItemServiceError(
      "Không tìm thấy serial sản phẩm",
      404
    );
  }

  return mapAdminProductItemToDto(item);
};

export const createAdminProductItemService = async (
  body: CreateProductItemBody
): Promise<AdminProductItemDto> => {
  const variantId = parsePositiveInt(body.variantId);

  if (!variantId) {
    throw new AdminProductItemServiceError("variantId không hợp lệ", 400);
  }

  const serialNumber = ensureSerialNumberProvided(
    normalizeText(body.serialNumber)
  );

  const status = parseStatusToDb(body.status) ?? PRODUCT_ITEM_STATUS_TO_DB.InStock;

  await ensureVariantExists(variantId);

  await ensureUniqueSerial(serialNumber);

  /**
   * API này chỉ quản lý serial, không tự tăng stock_quantity.
   * Tồn kho tổng vẫn nên do Inventory API quản lý để tránh cộng tồn kho 2 lần.
   */
  const item = await prisma.product_items.create({
    data: {
      variant_id: variantId,
      serial_number: serialNumber,
      status,
    },
    include: productItemInclude,
  });

  return mapAdminProductItemToDto(item);
};

export const updateAdminProductItemService = async (
  productItemId: number,
  body: UpdateProductItemBody
): Promise<AdminProductItemDto> => {
  const currentItem = await prisma.product_items.findUnique({
    where: {
      item_id: productItemId,
    },
  });

  if (!currentItem) {
    throw new AdminProductItemServiceError(
      "Không tìm thấy serial sản phẩm",
      404
    );
  }

  /**
   * Nếu item đã bán thì không cho sửa serial/variant.
   * Tránh sai dữ liệu sau bán hàng.
   */
  if (currentItem.status === PRODUCT_ITEM_STATUS_TO_DB.Sold) {
    const onlyStatusUpdate =
      Object.keys(body).length === 1 && body.status !== undefined;

    if (!onlyStatusUpdate) {
      throw new AdminProductItemServiceError(
        "Sản phẩm đã bán không được sửa thông tin serial",
        400
      );
    }
  }

  const updateData: any = {};

  if (body.variantId !== undefined) {
    const variantId = parsePositiveInt(body.variantId);

    if (!variantId) {
      throw new AdminProductItemServiceError("variantId không hợp lệ", 400);
    }

    await ensureVariantExists(variantId);

    updateData.variant_id = variantId;
  }

  if (body.serialNumber !== undefined) {
    updateData.serial_number = ensureSerialNumberProvided(
      normalizeText(body.serialNumber)
    );
  }

  if (body.status !== undefined) {
    updateData.status = parseStatusToDb(body.status);
  }

  if (Object.keys(updateData).length === 0) {
    throw new AdminProductItemServiceError(
      "Không có thông tin nào để cập nhật",
      400
    );
  }

  const nextSerialNumber =
    updateData.serial_number !== undefined
      ? updateData.serial_number
      : currentItem.serial_number;

  await ensureUniqueSerial(nextSerialNumber, productItemId);

  const updatedItem = await prisma.product_items.update({
    where: {
      item_id: productItemId,
    },
    data: updateData,
    include: productItemInclude,
  });

  return mapAdminProductItemToDto(updatedItem);
};

export const deleteAdminProductItemService = async (
  productItemId: number
): Promise<AdminProductItemDto> => {
  const currentItem = await prisma.product_items.findUnique({
    where: {
      item_id: productItemId,
    },
    include: productItemInclude,
  });

  if (!currentItem) {
    throw new AdminProductItemServiceError(
      "Không tìm thấy serial sản phẩm",
      404
    );
  }

  if (currentItem.status === PRODUCT_ITEM_STATUS_TO_DB.Sold) {
    throw new AdminProductItemServiceError(
      "Không thể xóa sản phẩm đã bán",
      400
    );
  }

  /**
   * Không xóa cứng Product Item.
   * Chỉ chuyển sang Inactive để giữ lịch sử serial.
   */
  const updatedItem = await prisma.product_items.update({
    where: {
      item_id: productItemId,
    },
    data: {
      status: PRODUCT_ITEM_STATUS_TO_DB.Inactive,
    },
    include: productItemInclude,
  });

  return mapAdminProductItemToDto(updatedItem);
};
