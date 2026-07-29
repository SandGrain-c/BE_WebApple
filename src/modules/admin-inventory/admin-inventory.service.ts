import prisma from "../../utils/prisma";
import { Prisma } from "../../generated/prisma/client";
import {
  InventoryReceiptDto,
  InventoryReceiptListResponseDto,
  InventoryVariantListResponseDto,
  InventoryVariantDto,
} from "./admin-inventory.dto";
import {
  mapInventoryReceiptListItemToDto,
  mapInventoryReceiptToDto,
  mapInventoryVariantToDto,
} from "./admin-inventory.mapper";
import { usesSerializedInventory } from "./inventory-serial.policy";

export class AdminInventoryServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const inventoryVariantInclude = {
  products: {
    select: {
      product_id: true,
      name: true,
      slug: true,
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
      item_id: true,
      status: true,
    },
  },
  _count: {
    select: {
      product_items: true,
    },
  },
};

const receiptDetailInclude = {
  inventory_receipt_details: {
    orderBy: {
      receipt_detail_id: "asc" as const,
    },
    include: {
      product_variants: {
        include: {
          products: {
            select: {
              product_id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      product_items: {
        orderBy: {
          item_id: "asc" as const,
        },
        select: {
          item_id: true,
          serial_number: true,
          status: true,
        },
      },
    },
  },
  users: {
    select: {
      user_id: true,
      full_name: true,
      user_name: true,
    },
  },
  suppliers: {
    select: {
      supplier_id: true,
      supplier_name: true,
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
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  const text = value.trim();
  return text ? text : null;
};

const validateAdminUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new AdminInventoryServiceError("Không xác định được nhân viên kho", 401);
  }
};

const normalizePositiveInteger = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AdminInventoryServiceError(`${fieldName} phải là số nguyên dương`, 400);
  }

  return value;
};

const normalizeQueryInteger = (
  value: unknown,
  fieldName: string,
  options: {
    fallback?: number;
    allowZero?: boolean;
    maximum?: number;
  } = {}
) => {
  if (value === undefined) {
    if (options.fallback !== undefined) {
      return options.fallback;
    }

    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  const minimumPattern = options.allowZero ? /^\d+$/ : /^[1-9]\d*$/;

  if (typeof value !== "string" || !minimumPattern.test(value)) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    (options.maximum !== undefined && parsed > options.maximum)
  ) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return parsed;
};

const normalizeMoney = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return value;
};

const normalizeSerialNumber = (value: unknown, fieldName: string) => {
  if (typeof value !== "string") {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  const serialNumber = value.trim();

  if (!serialNumber) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return serialNumber;
};

const isPrismaUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

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
    throw new AdminInventoryServiceError("Không tìm thấy biến thể sản phẩm", 404);
  }

  if (!variant.products?.is_active) {
    throw new AdminInventoryServiceError(
      `Sản phẩm ${variant.products?.name ?? ""} hiện không còn hoạt động`,
      400
    );
  }

  return variant;
};

const parseInventoryVariantQuery = (rawQuery: unknown) => {
  if (!isRecord(rawQuery)) {
    throw new AdminInventoryServiceError("Query tồn kho không hợp lệ", 400);
  }

  const page = normalizeQueryInteger(rawQuery.page, "page", {
    fallback: 1,
  });
  const requestedLimit = normalizeQueryInteger(rawQuery.limit, "limit", {
    fallback: 10,
  });
  const limit = Math.min(requestedLimit, 100);
  const productId =
    rawQuery.productId === undefined
      ? undefined
      : normalizeQueryInteger(rawQuery.productId, "productId");
  const lowStockThreshold =
    rawQuery.lowStockThreshold === undefined
      ? 5
      : normalizeQueryInteger(
          rawQuery.lowStockThreshold,
          "lowStockThreshold",
          { allowZero: true }
        );
  const search = normalizeOptionalText(rawQuery.search, "search");
  const stockStatus = rawQuery.stockStatus;
  const sort = rawQuery.sort;
  const allowedStockStatuses = [
    "in-stock",
    "low-stock",
    "out-of-stock",
  ];
  const allowedSorts = [
    "stock_asc",
    "stock_desc",
    "sku_asc",
    "sku_desc",
  ];

  if (
    stockStatus !== undefined &&
    (typeof stockStatus !== "string" ||
      !allowedStockStatuses.includes(stockStatus))
  ) {
    throw new AdminInventoryServiceError("stockStatus không hợp lệ", 400);
  }

  if (
    sort !== undefined &&
    (typeof sort !== "string" || !allowedSorts.includes(sort))
  ) {
    throw new AdminInventoryServiceError("sort không hợp lệ", 400);
  }

  return {
    page,
    limit,
    productId,
    lowStockThreshold,
    search,
    stockStatus,
    sort,
  };
};

const parseInventoryReceiptQuery = (rawQuery: unknown) => {
  if (!isRecord(rawQuery)) {
    throw new AdminInventoryServiceError("Query phiếu nhập không hợp lệ", 400);
  }

  const page = normalizeQueryInteger(rawQuery.page, "page", {
    fallback: 1,
  });
  const requestedLimit = normalizeQueryInteger(rawQuery.limit, "limit", {
    fallback: 10,
  });
  const sort = rawQuery.sort;
  const allowedSorts = ["oldest", "amount_asc", "amount_desc"];

  if (
    sort !== undefined &&
    (typeof sort !== "string" || !allowedSorts.includes(sort))
  ) {
    throw new AdminInventoryServiceError("sort không hợp lệ", 400);
  }

  const dateFrom = normalizeOptionalText(rawQuery.dateFrom, "dateFrom");
  const dateTo = normalizeOptionalText(rawQuery.dateTo, "dateTo");

  return {
    page,
    limit: Math.min(requestedLimit, 100),
    search: normalizeOptionalText(rawQuery.search, "search"),
    dateFrom,
    dateTo,
    sort,
  };
};

/**
 * GET /api/admin/inventory/variants
 * Lấy danh sách tồn kho theo variant.
 */
export const getInventoryVariantsService = async (
  rawQuery: unknown
): Promise<InventoryVariantListResponseDto> => {
  const query = parseInventoryVariantQuery(rawQuery);
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const search = query.search;
  const productId = query.productId;
  const lowStockThreshold = query.lowStockThreshold;

  const where: any = {};

  if (search) {
    where.OR = [
      {
        sku: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        variant_name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        products: {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  if (productId !== undefined) {
    where.product_id = productId;
  }

  if (query.stockStatus === "out-of-stock") {
    where.stock_quantity = {
      lte: 0,
    };
  }

  if (query.stockStatus === "low-stock") {
    where.stock_quantity = {
      gt: 0,
      lte: lowStockThreshold,
    };
  }

  if (query.stockStatus === "in-stock") {
    where.stock_quantity = {
      gt: lowStockThreshold,
    };
  }

  let orderBy: any = {
    variant_id: "desc",
  };

  switch (query.sort) {
    case "stock_asc":
      orderBy = { stock_quantity: "asc" };
      break;
    case "stock_desc":
      orderBy = { stock_quantity: "desc" };
      break;
    case "sku_asc":
      orderBy = { sku: "asc" };
      break;
    case "sku_desc":
      orderBy = { sku: "desc" };
      break;
    default:
      orderBy = { variant_id: "desc" };
      break;
  }

  const [variants, totalItems] = await Promise.all([
    prisma.product_variants.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: inventoryVariantInclude,
    }),

    prisma.product_variants.count({
      where,
    }),
  ]);

  return {
    items: variants.map((variant) =>
      mapInventoryVariantToDto(variant, lowStockThreshold)
    ),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/inventory/receipts
 * Lấy danh sách phiếu nhập kho.
 */
export const getInventoryReceiptsService = async (
  rawQuery: unknown
): Promise<InventoryReceiptListResponseDto> => {
  const query = parseInventoryReceiptQuery(rawQuery);
  const page = query.page;
  const limit = query.limit;
  const skip = (page - 1) * limit;

  const search = query.search;

  const where: any = {};

  if (search) {
    where.OR = [
      {
        supplier_name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        suppliers: {
          supplier_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        users: {
          full_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.created_at = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);

      if (Number.isNaN(dateFrom.getTime())) {
        throw new AdminInventoryServiceError("dateFrom không hợp lệ", 400);
      }

      where.created_at.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      if (Number.isNaN(dateTo.getTime())) {
        throw new AdminInventoryServiceError("dateTo không hợp lệ", 400);
      }

      where.created_at.lte = dateTo;
    }
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "amount_asc":
      orderBy = { total_amount: "asc" };
      break;
    case "amount_desc":
      orderBy = { total_amount: "desc" };
      break;
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [receipts, totalItems] = await Promise.all([
    prisma.inventory_receipts.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        inventory_receipt_details: {
          select: {
            quantity: true,
          },
        },
        users: {
          select: {
            user_id: true,
            full_name: true,
            user_name: true,
          },
        },
        suppliers: {
          select: {
            supplier_id: true,
            supplier_name: true,
          },
        },
      },
    }),

    prisma.inventory_receipts.count({
      where,
    }),
  ]);

  return {
    items: receipts.map(mapInventoryReceiptListItemToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/inventory/receipts/:receiptId
 * Lấy chi tiết phiếu nhập kho.
 */
export const getInventoryReceiptDetailService = async (
  receiptId: number
): Promise<InventoryReceiptDto> => {
  if (!receiptId || Number.isNaN(receiptId)) {
    throw new AdminInventoryServiceError("receiptId không hợp lệ", 400);
  }

  const receipt = await prisma.inventory_receipts.findUnique({
    where: {
      receipt_id: receiptId,
    },
    include: receiptDetailInclude,
  });

  if (!receipt) {
    throw new AdminInventoryServiceError("Không tìm thấy phiếu nhập kho", 404);
  }

  return mapInventoryReceiptToDto(receipt);
};

/**
 * POST /api/admin/inventory/receipts
 * Tạo phiếu nhập kho và tăng tồn kho.
 */
export const createInventoryReceiptService = async (
  warehouseStaffId: number,
  rawBody: unknown
): Promise<InventoryReceiptDto> => {
  validateAdminUserId(warehouseStaffId);

  if (!isRecord(rawBody)) {
    throw new AdminInventoryServiceError("Dữ liệu phiếu nhập không hợp lệ", 400);
  }

  if (!Array.isArray(rawBody.items) || rawBody.items.length === 0) {
    throw new AdminInventoryServiceError("Phiếu nhập phải có ít nhất một sản phẩm", 400);
  }

  const supplierName = normalizeOptionalText(
    rawBody.supplierName,
    "supplierName"
  );
  const supplierId =
    rawBody.supplierId === undefined || rawBody.supplierId === null
      ? null
      : normalizePositiveInteger(rawBody.supplierId, "supplierId");

  const normalizedItems = rawBody.items.map((rawItem, index) => {
    if (!isRecord(rawItem)) {
      throw new AdminInventoryServiceError(
        `Dòng ${index + 1} không hợp lệ`,
        400
      );
    }

    const variantId = normalizePositiveInteger(
      rawItem.variantId,
      `variantId dòng ${index + 1}`
    );

    const quantity = normalizePositiveInteger(
      rawItem.quantity,
      `quantity dòng ${index + 1}`
    );

    const costPrice = normalizeMoney(
      rawItem.costPrice,
      `costPrice dòng ${index + 1}`
    );

    if (
      rawItem.serialNumbers !== undefined &&
      !Array.isArray(rawItem.serialNumbers)
    ) {
      throw new AdminInventoryServiceError(
        `serialNumbers dòng ${index + 1} không hợp lệ`,
        400
      );
    }

    const serialNumbers = Array.isArray(rawItem.serialNumbers)
      ? rawItem.serialNumbers.map((serial, serialIndex) =>
          normalizeSerialNumber(
            serial,
            `serialNumber ${serialIndex + 1} dòng ${index + 1}`
          )
        )
      : [];

    if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
      throw new AdminInventoryServiceError(
        `Số lượng serialNumbers ở dòng ${index + 1} phải bằng quantity`,
        400
      );
    }

    const duplicatedSerials = serialNumbers.filter(
      (serial, serialIndex) => serialNumbers.indexOf(serial) !== serialIndex
    );

    if (duplicatedSerials.length > 0) {
      throw new AdminInventoryServiceError(
        `Có serialNumber bị trùng trong dòng ${index + 1}`,
        400
      );
    }

    return {
      variantId,
      quantity,
      costPrice,
      serialNumbers,
    };
  });

  const allSerialNumbers = normalizedItems.flatMap((item) => item.serialNumbers);

  const duplicatedAcrossReceipt = allSerialNumbers.filter(
    (serial, index) => allSerialNumbers.indexOf(serial) !== index
  );

  if (duplicatedAcrossReceipt.length > 0) {
    throw new AdminInventoryServiceError(
      "Có serialNumber bị trùng trong phiếu nhập",
      400
    );
  }

  if (allSerialNumbers.length > 0) {
    const existedProductItem = await prisma.product_items.findFirst({
      where: {
        serial_number: {
          in: allSerialNumbers,
        },
      },
      select: {
        serial_number: true,
      },
    });

    if (existedProductItem) {
      throw new AdminInventoryServiceError(
        `Serial ${existedProductItem.serial_number} đã tồn tại`,
        409
      );
    }
  }

  for (const item of normalizedItems) {
    const variant = await ensureVariantExists(item.variantId);

    if (
      usesSerializedInventory(variant) &&
      item.serialNumbers.length !== item.quantity
    ) {
      throw new AdminInventoryServiceError(
        `Biến thể ở dòng ${normalizedItems.indexOf(item) + 1} yêu cầu đủ serialNumber`,
        400
      );
    }
  }

  const totalAmount = normalizedItems.reduce(
    (sum, item) => sum + item.quantity * item.costPrice,
    0
  );

  let createdReceipt;

  try {
    createdReceipt = await prisma.$transaction(async (tx) => {
      const receipt = await tx.inventory_receipts.create({
        data: {
          warehouse_staff_id: warehouseStaffId,
          supplier_name: supplierName,
          supplier_id: supplierId,
          total_amount: totalAmount,
        },
      });

      for (const item of normalizedItems) {
        const detail = await tx.inventory_receipt_details.create({
          data: {
            receipt_id: receipt.receipt_id,
            variant_id: item.variantId,
            quantity: item.quantity,
            cost_price: item.costPrice,
          },
        });

        await tx.product_variants.update({
          where: {
            variant_id: item.variantId,
          },
          data: {
            stock_quantity: {
              increment: item.quantity,
            },
          },
        });

        if (item.serialNumbers.length > 0) {
          await tx.product_items.createMany({
            data: item.serialNumbers.map((serialNumber) => ({
              variant_id: item.variantId,
              serial_number: serialNumber,
              status: 1,
              import_receipt_detail_id: detail.receipt_detail_id,
            })),
          });
        }
      }

      await tx.audit_logs.create({
        data: {
          user_id: warehouseStaffId,
          action: "CREATE_INVENTORY_RECEIPT",
          entity_type: "inventory_receipts",
          entity_id: receipt.receipt_id,
          old_value: null,
          new_value: JSON.stringify({
            receiptId: receipt.receipt_id,
            totalAmount,
            items: normalizedItems,
          }),
        },
      });

      return tx.inventory_receipts.findUnique({
        where: {
          receipt_id: receipt.receipt_id,
        },
        include: receiptDetailInclude,
      });
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AdminInventoryServiceError("Serial đã tồn tại", 409);
    }

    throw error;
  }

  if (!createdReceipt) {
    throw new AdminInventoryServiceError("Tạo phiếu nhập kho thất bại", 500);
  }

  return mapInventoryReceiptToDto(createdReceipt);
};

/**
 * PATCH /api/admin/inventory/variants/:variantId/stock
 * Điều chỉnh tồn kho thủ công.
 */
export const adjustVariantStockService = async (
  adminUserId: number,
  variantId: number,
  rawBody: unknown
): Promise<InventoryVariantDto> => {
  validateAdminUserId(adminUserId);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new AdminInventoryServiceError("variantId không hợp lệ", 400);
  }

  if (!isRecord(rawBody)) {
    throw new AdminInventoryServiceError(
      "Dữ liệu điều chỉnh tồn kho không hợp lệ",
      400
    );
  }

  const type = rawBody.type;
  const quantity = normalizePositiveInteger(rawBody.quantity, "quantity");
  const reason = normalizeOptionalText(rawBody.reason, "reason");

  if (
    typeof type !== "string" ||
    !["set", "increase", "decrease"].includes(type)
  ) {
    throw new AdminInventoryServiceError(
      "type chỉ được là set, increase hoặc decrease",
      400
    );
  }

  if (!reason) {
    throw new AdminInventoryServiceError("Vui lòng nhập lý do điều chỉnh tồn kho", 400);
  }

  const updatedVariant = await prisma.$transaction(async (tx) => {
    const variant = await tx.product_variants.findUnique({
      where: {
        variant_id: variantId,
      },
      include: inventoryVariantInclude,
    });

    if (!variant) {
      throw new AdminInventoryServiceError("Không tìm thấy biến thể sản phẩm", 404);
    }

    const oldStock = variant.stock_quantity;

    let newStock = oldStock;

    if (type === "set") {
      newStock = quantity;
    }

    if (type === "increase") {
      newStock = oldStock + quantity;
    }

    if (type === "decrease") {
      newStock = oldStock - quantity;
    }

    if (newStock < 0) {
      throw new AdminInventoryServiceError("Tồn kho sau điều chỉnh không được âm", 400);
    }

    const serializedInventory = usesSerializedInventory(variant);
    const serializedDecrease = oldStock - newStock;

    if (serializedInventory && newStock > oldStock) {
      throw new AdminInventoryServiceError(
        "Không thể tăng counter của biến thể quản lý theo serial",
        409
      );
    }

    const serializedItemIds =
      serializedInventory && serializedDecrease > 0
        ? variant.product_items
            .filter((item) => item.status === 1)
            .slice(0, serializedDecrease)
            .map((item) => item.item_id)
        : [];

    if (
      serializedInventory &&
      serializedDecrease > 0 &&
      serializedItemIds.length !== serializedDecrease
    ) {
      throw new AdminInventoryServiceError(
        "Số lượng serial khả dụng không đủ",
        409
      );
    }

    const stockUpdate = await tx.product_variants.updateMany({
      where: {
        variant_id: variantId,
        stock_quantity: oldStock,
      },
      data: {
        stock_quantity: newStock,
      },
    });

    if (stockUpdate.count !== 1) {
      throw new AdminInventoryServiceError(
        "Tồn kho đã được thay đổi bởi yêu cầu khác",
        409
      );
    }

    if (serializedItemIds.length > 0) {
      const itemUpdate = await tx.product_items.updateMany({
        where: {
          item_id: {
            in: serializedItemIds,
          },
          status: 1,
        },
        data: {
          status: 6,
        },
      });

      if (itemUpdate.count !== serializedItemIds.length) {
        throw new AdminInventoryServiceError(
          "Serial tồn kho đã được thay đổi bởi yêu cầu khác",
          409
        );
      }
    }

    await tx.audit_logs.create({
      data: {
        user_id: adminUserId,
        action: "ADJUST_STOCK",
        entity_type: "product_variants",
        entity_id: variantId,
        old_value: JSON.stringify({
          stockQuantity: oldStock,
        }),
        new_value: JSON.stringify({
          stockQuantity: newStock,
          type,
          quantity,
          reason,
        }),
      },
    });

    return tx.product_variants.findUnique({
      where: {
        variant_id: variantId,
      },
      include: inventoryVariantInclude,
    });
  });

  if (!updatedVariant) {
    throw new AdminInventoryServiceError("Điều chỉnh tồn kho thất bại", 500);
  }

  return mapInventoryVariantToDto(updatedVariant);
};
