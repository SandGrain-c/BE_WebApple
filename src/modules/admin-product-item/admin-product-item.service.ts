// src/modules/admin-product-item/admin-product-item.service.ts

import prisma from "../../utils/prisma";
import { Prisma } from "../../generated/prisma/client";
import type {
  AdminProductItemDto,
  AdminProductItemListResponseDto,
  ProductItemStatus,
} from "./admin-product-item.dto";
import { mapAdminProductItemToDto } from "./admin-product-item.mapper";
import { usesSerializedInventory } from "../admin-inventory/inventory-serial.policy";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeOptionalText = (
  value: unknown,
  fieldName: string
): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminProductItemServiceError(
      `${fieldName} không hợp lệ`,
      400
    );
  }

  const text = value.trim();

  return text || null;
};

const parsePositiveBodyInteger = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AdminProductItemServiceError(
      `${fieldName} không hợp lệ`,
      400
    );
  }

  return value;
};

const parsePositiveQueryInteger = (
  value: unknown,
  fieldName: string,
  fallback?: number
) => {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new AdminProductItemServiceError(
      `${fieldName} không hợp lệ`,
      400
    );
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new AdminProductItemServiceError(
      `${fieldName} không hợp lệ`,
      400
    );
  }

  return parsed;
};

/**
 * Convert status từ API dạng string sang DB dạng number.
 */
const parseStatusToDb = (status: unknown): number | null => {
  if (status === undefined || status === null) {
    return null;
  }

  if (
    typeof status !== "string" ||
    !PRODUCT_ITEM_STATUSES.includes(status as ProductItemStatus)
  ) {
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
      products: {
        include: {
          categories: {
            select: {
              category_name: true,
              slug: true,
            },
          },
        },
      },
      product_items: {
        select: {
          status: true,
        },
      },
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

const normalizeSerialNumber = (value: unknown) =>
  ensureSerialNumberProvided(
    normalizeOptionalText(value, "serialNumber")
  );

const isPrismaUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const GENERIC_STATUS_TRANSITIONS: Record<number, readonly number[]> = {
  [PRODUCT_ITEM_STATUS_TO_DB.InStock]: [
    PRODUCT_ITEM_STATUS_TO_DB.Reserved,
    PRODUCT_ITEM_STATUS_TO_DB.Warranty,
    PRODUCT_ITEM_STATUS_TO_DB.Inactive,
  ],
  [PRODUCT_ITEM_STATUS_TO_DB.Reserved]: [
    PRODUCT_ITEM_STATUS_TO_DB.InStock,
    PRODUCT_ITEM_STATUS_TO_DB.Inactive,
  ],
  [PRODUCT_ITEM_STATUS_TO_DB.Sold]: [],
  [PRODUCT_ITEM_STATUS_TO_DB.Warranty]: [
    PRODUCT_ITEM_STATUS_TO_DB.Returned,
    PRODUCT_ITEM_STATUS_TO_DB.InStock,
    PRODUCT_ITEM_STATUS_TO_DB.Inactive,
  ],
  [PRODUCT_ITEM_STATUS_TO_DB.Returned]: [
    PRODUCT_ITEM_STATUS_TO_DB.InStock,
    PRODUCT_ITEM_STATUS_TO_DB.Warranty,
    PRODUCT_ITEM_STATUS_TO_DB.Inactive,
  ],
  [PRODUCT_ITEM_STATUS_TO_DB.Inactive]: [
    PRODUCT_ITEM_STATUS_TO_DB.InStock,
  ],
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
  rawQuery: unknown
): Promise<AdminProductItemListResponseDto> => {
  if (!isRecord(rawQuery)) {
    throw new AdminProductItemServiceError("Query serial không hợp lệ", 400);
  }

  const page = parsePositiveQueryInteger(rawQuery.page, "page", 1);
  const limit = Math.min(
    parsePositiveQueryInteger(rawQuery.limit, "limit", 10),
    100
  );
  const skip = (page - 1) * limit;

  const keyword = normalizeOptionalText(rawQuery.q, "q");
  const status = parseStatusToDb(rawQuery.status);
  const variantId =
    rawQuery.variantId === undefined
      ? undefined
      : parsePositiveQueryInteger(rawQuery.variantId, "variantId");
  const productId =
    rawQuery.productId === undefined
      ? undefined
      : parsePositiveQueryInteger(rawQuery.productId, "productId");

  const where: Prisma.product_itemsWhereInput = {};

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
  rawBody: unknown
): Promise<AdminProductItemDto> => {
  if (!isRecord(rawBody)) {
    throw new AdminProductItemServiceError(
      "Dữ liệu serial không hợp lệ",
      400
    );
  }

  const variantId = parsePositiveBodyInteger(
    rawBody.variantId,
    "variantId"
  );
  const serialNumber = normalizeSerialNumber(rawBody.serialNumber);
  const requestedStatus = parseStatusToDb(rawBody.status);

  if (
    requestedStatus !== null &&
    requestedStatus !== PRODUCT_ITEM_STATUS_TO_DB.InStock
  ) {
    throw new AdminProductItemServiceError(
      "Serial mới chỉ được tạo ở trạng thái InStock",
      400
    );
  }

  await ensureUniqueSerial(serialNumber);
  const variant = await ensureVariantExists(variantId);
  const status = PRODUCT_ITEM_STATUS_TO_DB.InStock;

  if (usesSerializedInventory(variant)) {
    throw new AdminProductItemServiceError(
      "Hãy tạo serial của biến thể này qua phiếu nhập kho",
      409
    );
  }

  let item;

  try {
    item = await prisma.product_items.create({
      data: {
        variant_id: variantId,
        serial_number: serialNumber,
        status,
      },
      include: productItemInclude,
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AdminProductItemServiceError("Serial đã tồn tại", 409);
    }

    throw error;
  }

  return mapAdminProductItemToDto(item);
};

export const updateAdminProductItemService = async (
  productItemId: number,
  rawBody: unknown
): Promise<AdminProductItemDto> => {
  if (!isRecord(rawBody)) {
    throw new AdminProductItemServiceError(
      "Dữ liệu cập nhật serial không hợp lệ",
      400
    );
  }

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

  if (currentItem.status === PRODUCT_ITEM_STATUS_TO_DB.Sold) {
    throw new AdminProductItemServiceError(
      "Sản phẩm đã bán không được sửa thông tin serial",
      400
    );
  }

  const updateData: {
    variant_id?: number;
    serial_number?: string;
    status?: number;
  } = {};
  let targetVariant:
    | Awaited<ReturnType<typeof ensureVariantExists>>
    | undefined;

  if (rawBody.variantId !== undefined) {
    const variantId = parsePositiveBodyInteger(
      rawBody.variantId,
      "variantId"
    );

    targetVariant = await ensureVariantExists(variantId);

    updateData.variant_id = variantId;
  }

  if (rawBody.serialNumber !== undefined) {
    updateData.serial_number = normalizeSerialNumber(rawBody.serialNumber);
  }

  if (rawBody.status !== undefined) {
    const nextStatus = parseStatusToDb(rawBody.status);

    if (
      nextStatus === null ||
      nextStatus === PRODUCT_ITEM_STATUS_TO_DB.Sold ||
      !GENERIC_STATUS_TRANSITIONS[currentItem.status]?.includes(nextStatus)
    ) {
      throw new AdminProductItemServiceError(
        "Không thể chuyển trạng thái serial theo yêu cầu",
        400
      );
    }

    updateData.status = nextStatus;
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

  const currentVariant = await ensureVariantExists(currentItem.variant_id);
  const changesInStockMembership =
    updateData.status !== undefined &&
    (currentItem.status === PRODUCT_ITEM_STATUS_TO_DB.InStock ||
      updateData.status === PRODUCT_ITEM_STATUS_TO_DB.InStock);

  if (
    (changesInStockMembership || updateData.variant_id !== undefined) &&
    (usesSerializedInventory(currentVariant) ||
      (targetVariant !== undefined &&
        usesSerializedInventory(targetVariant)))
  ) {
    throw new AdminProductItemServiceError(
      "Không thể thay đổi counter/serial ngoài nghiệp vụ kho",
      409
    );
  }

  await ensureUniqueSerial(nextSerialNumber, productItemId);

  let updatedItem;

  try {
    updatedItem = await prisma.product_items.update({
      where: {
        item_id: productItemId,
      },
      data: updateData,
      include: productItemInclude,
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AdminProductItemServiceError("Serial đã tồn tại", 409);
    }

    throw error;
  }

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

  const currentVariant = await ensureVariantExists(currentItem.variant_id);

  if (
    currentItem.status === PRODUCT_ITEM_STATUS_TO_DB.InStock &&
    usesSerializedInventory(currentVariant)
  ) {
    throw new AdminProductItemServiceError(
      "Không thể xóa serial InStock ngoài nghiệp vụ kho",
      409
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
