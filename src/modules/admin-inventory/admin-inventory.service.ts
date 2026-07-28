import prisma from "../../utils/prisma";
import {
  AdjustStockBody,
  CreateInventoryReceiptBody,
  GetInventoryReceiptsQuery,
  GetInventoryVariantsQuery,
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

const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const validateAdminUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new AdminInventoryServiceError("Không xác định được nhân viên kho", 401);
  }
};

const normalizePositiveInteger = (value: unknown, fieldName: string) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new AdminInventoryServiceError(`${fieldName} phải là số nguyên dương`, 400);
  }

  return numberValue;
};

const normalizeNonNegativeInteger = (value: unknown, fieldName: string) => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return numberValue;
};

const normalizeMoney = (value: unknown, fieldName: string) => {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || numberValue < 0) {
    throw new AdminInventoryServiceError(`${fieldName} không hợp lệ`, 400);
  }

  return numberValue;
};

const ensureVariantExists = async (variantId: number) => {
  const variant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    include: {
      products: {
        select: {
          product_id: true,
          name: true,
          is_active: true,
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

/**
 * GET /api/admin/inventory/variants
 * Lấy danh sách tồn kho theo variant.
 */
export const getInventoryVariantsService = async (
  query: GetInventoryVariantsQuery
): Promise<InventoryVariantListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);
  const productId = query.productId ? Number(query.productId) : undefined;
  const lowStockThreshold =
    query.lowStockThreshold !== undefined && query.lowStockThreshold !== ""
      ? normalizeNonNegativeInteger(query.lowStockThreshold, "lowStockThreshold")
      : 5;

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
    if (Number.isNaN(productId)) {
      throw new AdminInventoryServiceError("productId không hợp lệ", 400);
    }

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
  query: GetInventoryReceiptsQuery
): Promise<InventoryReceiptListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);

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
  body: CreateInventoryReceiptBody
): Promise<InventoryReceiptDto> => {
  validateAdminUserId(warehouseStaffId);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new AdminInventoryServiceError("Phiếu nhập phải có ít nhất một sản phẩm", 400);
  }

  const supplierName = normalizeText(body.supplierName);
  const supplierId =
    body.supplierId === undefined || body.supplierId === null
      ? null
      : Number(body.supplierId);

  if (supplierId !== null && Number.isNaN(supplierId)) {
    throw new AdminInventoryServiceError("supplierId không hợp lệ", 400);
  }

  const normalizedItems = body.items.map((item, index) => {
    const variantId = normalizePositiveInteger(
      item.variantId,
      `variantId dòng ${index + 1}`
    );

    const quantity = normalizePositiveInteger(
      item.quantity,
      `quantity dòng ${index + 1}`
    );

    const costPrice = normalizeMoney(item.costPrice, `costPrice dòng ${index + 1}`);

    const serialNumbers = Array.isArray(item.serialNumbers)
      ? item.serialNumbers
          .map((serial) => normalizeText(serial))
          .filter((serial): serial is string => !!serial)
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
    await ensureVariantExists(item.variantId);
  }

  const totalAmount = normalizedItems.reduce(
    (sum, item) => sum + item.quantity * item.costPrice,
    0
  );

  const createdReceipt = await prisma.$transaction(async (tx) => {
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

      /**
       * Tăng tồn kho tổng ở product_variants.
       */
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

      /**
       * Nếu có serial, tạo product_items để quản lý từng máy.
       */
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

    /**
     * Ghi audit log để biết ai nhập kho.
     */
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
  body: AdjustStockBody
): Promise<InventoryVariantDto> => {
  validateAdminUserId(adminUserId);

  if (!variantId || Number.isNaN(variantId)) {
    throw new AdminInventoryServiceError("variantId không hợp lệ", 400);
  }

  const type = body.type;
  const quantity = normalizeNonNegativeInteger(body.quantity, "quantity");
  const reason = normalizeText(body.reason);

  if (!["set", "increase", "decrease"].includes(type)) {
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

    await tx.product_variants.update({
      where: {
        variant_id: variantId,
      },
      data: {
        stock_quantity: newStock,
      },
    });

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