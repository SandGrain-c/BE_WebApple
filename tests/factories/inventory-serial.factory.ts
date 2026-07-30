import type { PrismaClient } from "../../src/generated/prisma/client";
import type { AccountFixture } from "../fixtures/fixture-manifest";
import { createOrderCustomer } from "./order-lifecycle.factory";

export const PRODUCT_ITEM_STATUS = {
  InStock: 1,
  Reserved: 2,
  Sold: 3,
  Warranty: 4,
  Returned: 5,
  Inactive: 6,
} as const;

let inventoryFixtureCounter = 0;

function nextInventoryNamespace(label: string) {
  inventoryFixtureCounter += 1;
  const safeLabel =
    label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) ||
    "inventory";

  return `${safeLabel}${inventoryFixtureCounter}`;
}

export async function createInventorySerialScenario(
  prisma: PrismaClient,
  input: {
    label: string;
    serializedStock?: number;
  },
) {
  const namespace = nextInventoryNamespace(input.label);
  const createdAt = new Date("2026-07-21T08:00:00.000Z");
  const category = await prisma.categories.create({
    data: {
      category_name: `iPhone Inventory ${namespace}`,
      slug: `iphone-inventory-${namespace}`,
      description: "Inventory and serial integration fixture",
      display_order: inventoryFixtureCounter,
      is_active: true,
    },
  });
  const product = await prisma.products.create({
    data: {
      category_id: category.category_id,
      name: `iPhone Inventory ${namespace}`,
      slug: `iphone-inventory-product-${namespace}`,
      description: "Serialized Apple device test product",
      is_active: true,
      created_at: createdAt,
    },
  });
  const serializedVariant = await prisma.product_variants.create({
    data: {
      product_id: product.product_id,
      variant_name: `Serialized ${namespace}`,
      sku: `INV-SER-${namespace}`.toUpperCase().slice(0, 50),
      color: "Test Black",
      capacity: "256GB",
      ram: "8GB",
      country: "VN",
      price: 2_000,
      stock_quantity: input.serializedStock ?? 1,
    },
  });
  const healthyVariant = await prisma.product_variants.create({
    data: {
      product_id: product.product_id,
      variant_name: `Healthy ${namespace}`,
      sku: `INV-HIGH-${namespace}`.toUpperCase().slice(0, 50),
      color: "Test Blue",
      capacity: "128GB",
      ram: "8GB",
      country: "VN",
      price: 1_500,
      stock_quantity: 10,
    },
  });
  const lowStockVariant = await prisma.product_variants.create({
    data: {
      product_id: product.product_id,
      variant_name: `Low ${namespace}`,
      sku: `INV-LOW-${namespace}`.toUpperCase().slice(0, 50),
      color: "Test Silver",
      capacity: "128GB",
      ram: "8GB",
      country: "VN",
      price: 1_400,
      stock_quantity: 3,
    },
  });
  const outOfStockVariant = await prisma.product_variants.create({
    data: {
      product_id: product.product_id,
      variant_name: `Out ${namespace}`,
      sku: `INV-OUT-${namespace}`.toUpperCase().slice(0, 50),
      color: "Test White",
      capacity: "64GB",
      ram: "4GB",
      country: "VN",
      price: 1_000,
      stock_quantity: 0,
    },
  });
  const inactiveProduct = await prisma.products.create({
    data: {
      category_id: category.category_id,
      name: `Inactive Inventory ${namespace}`,
      slug: `inactive-inventory-${namespace}`,
      description: "Inactive inventory fixture",
      is_active: false,
      created_at: createdAt,
    },
  });
  const inactiveProductVariant = await prisma.product_variants.create({
    data: {
      product_id: inactiveProduct.product_id,
      variant_name: `Inactive ${namespace}`,
      sku: `INV-INACTIVE-${namespace}`.toUpperCase().slice(0, 50),
      price: 900,
      stock_quantity: 0,
    },
  });
  const supplierActive = await prisma.suppliers.create({
    data: {
      supplier_name: `Inventory Supplier ${namespace}`,
      phone: "0800000001",
      email: `${namespace}@supplier.test.invalid`,
      address: "Test supplier address",
      status: "Active",
      created_at: createdAt,
    },
  });
  const supplierInactive = await prisma.suppliers.create({
    data: {
      supplier_name: `Inactive Supplier ${namespace}`,
      phone: "0800000002",
      email: `${namespace}-inactive@supplier.test.invalid`,
      address: "Inactive supplier address",
      status: "Inactive",
      created_at: createdAt,
    },
  });

  const serialPrefix = `TST-${namespace}`.toUpperCase();
  const availableItem = await prisma.product_items.create({
    data: {
      variant_id: serializedVariant.variant_id,
      serial_number: `${serialPrefix}-AVAILABLE`.slice(0, 50),
      status: PRODUCT_ITEM_STATUS.InStock,
    },
  });
  const reservedItem = await prisma.product_items.create({
    data: {
      variant_id: serializedVariant.variant_id,
      serial_number: `${serialPrefix}-RESERVED`.slice(0, 50),
      status: PRODUCT_ITEM_STATUS.Reserved,
    },
  });
  const soldItem = await prisma.product_items.create({
    data: {
      variant_id: serializedVariant.variant_id,
      serial_number: `${serialPrefix}-SOLD`.slice(0, 50),
      status: PRODUCT_ITEM_STATUS.Sold,
    },
  });
  const otherVariantItem = await prisma.product_items.create({
    data: {
      variant_id: healthyVariant.variant_id,
      serial_number: `${serialPrefix}-OTHER`.slice(0, 50),
      status: PRODUCT_ITEM_STATUS.InStock,
    },
  });

  return {
    namespace,
    createdAt,
    category,
    product,
    serializedVariant,
    healthyVariant,
    lowStockVariant,
    outOfStockVariant,
    inactiveProduct,
    inactiveProductVariant,
    supplierActive,
    supplierInactive,
    availableItem,
    reservedItem,
    soldItem,
    otherVariantItem,
    serialPrefix,
  };
}

export async function snapshotInventoryVariant(
  prisma: PrismaClient,
  variantId: number,
) {
  const [variant, items, details, audits] = await Promise.all([
    prisma.product_variants.findUnique({
      where: { variant_id: variantId },
      select: {
        variant_id: true,
        stock_quantity: true,
        price: true,
      },
    }),
    prisma.product_items.findMany({
      where: { variant_id: variantId },
      orderBy: { item_id: "asc" },
      select: {
        item_id: true,
        variant_id: true,
        serial_number: true,
        status: true,
        import_receipt_detail_id: true,
        order_detail_id: true,
      },
    }),
    prisma.inventory_receipt_details.findMany({
      where: { variant_id: variantId },
      orderBy: { receipt_detail_id: "asc" },
      select: {
        receipt_detail_id: true,
        receipt_id: true,
        variant_id: true,
        quantity: true,
        cost_price: true,
      },
    }),
    prisma.audit_logs.findMany({
      where: {
        entity_type: "product_variants",
        entity_id: variantId,
      },
      orderBy: { log_id: "asc" },
      select: {
        log_id: true,
        user_id: true,
        action: true,
        entity_type: true,
        entity_id: true,
      },
    }),
  ]);
  const receiptIds = details.map((detail) => detail.receipt_id);
  const receipts = await prisma.inventory_receipts.findMany({
    where: {
      receipt_id: {
        in: receiptIds,
      },
    },
    orderBy: { receipt_id: "asc" },
    select: {
      receipt_id: true,
      warehouse_staff_id: true,
      supplier_id: true,
      supplier_name: true,
      total_amount: true,
      created_at: true,
    },
  });
  const receiptAudits = receiptIds.length
    ? await prisma.audit_logs.findMany({
        where: {
          entity_type: "inventory_receipts",
          entity_id: {
            in: receiptIds,
          },
        },
        orderBy: { log_id: "asc" },
        select: {
          log_id: true,
          user_id: true,
          action: true,
          entity_type: true,
          entity_id: true,
        },
      })
    : [];

  return {
    variant: variant
      ? {
          ...variant,
          price: Number(variant.price),
        }
      : null,
    items,
    details: details.map((detail) => ({
      ...detail,
      cost_price: Number(detail.cost_price),
    })),
    receipts: receipts.map((receipt) => ({
      ...receipt,
      total_amount:
        receipt.total_amount === null ? null : Number(receipt.total_amount),
      created_at: receipt.created_at.toISOString(),
    })),
    audits: [...audits, ...receiptAudits].sort(
      (left, right) => left.log_id - right.log_id,
    ),
  };
}

export async function createSerialOrderScenario(
  prisma: PrismaClient,
  input: {
    label: string;
    orderStatus?: "PendingPayment" | "PendingConfirmation" | "Completed";
    itemStatus?: keyof typeof PRODUCT_ITEM_STATUS;
  },
) {
  const catalog = await createInventorySerialScenario(prisma, {
    label: input.label,
  });
  const customer = await createOrderCustomer(
    prisma,
    `${input.label}-customer`,
  );
  const createdAt = new Date("2026-07-21T09:00:00.000Z");
  const orderStatus = input.orderStatus ?? "PendingConfirmation";
  const order = await prisma.orders.create({
    data: {
      user_id: customer.user.user_id,
      order_code: `INV-ORDER-${catalog.namespace}`.toUpperCase().slice(0, 50),
      sub_total: 2_000,
      shipping_fee: 0,
      discount_amount: 0,
      total_amount: 2_000,
      order_status: orderStatus,
      customer_name: `Inventory Customer ${catalog.namespace}`,
      customer_phone: "0800000003",
      shipping_address: "Inventory Test Address",
      created_at: createdAt,
      updated_at: createdAt,
    },
  });
  const detail = await prisma.order_details.create({
    data: {
      order_id: order.order_id,
      variant_id: catalog.serializedVariant.variant_id,
      quantity: 1,
      unit_price: 2_000,
    },
  });
  const itemStatus = input.itemStatus ?? "Reserved";
  const assignedItem =
    itemStatus === "Sold" ? catalog.soldItem : catalog.reservedItem;
  const item = await prisma.product_items.update({
    where: { item_id: assignedItem.item_id },
    data: {
      status: PRODUCT_ITEM_STATUS[itemStatus],
      order_detail_id: detail.order_detail_id,
    },
  });
  const initialHistory = await prisma.order_status_history.create({
    data: {
      order_id: order.order_id,
      old_status: null,
      new_status: orderStatus,
      changed_by: customer.user.user_id,
      note: `Initial inventory order ${orderStatus}`,
      created_at: createdAt,
    },
  });
  const payment = await prisma.payment_transactions.create({
    data: {
      order_id: order.order_id,
      gateway: "COD",
      amount: 2_000,
      payment_type: "Payment",
      status: orderStatus === "Completed" ? "Success" : "Pending",
      paid_at: orderStatus === "Completed" ? createdAt : null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  });
  const reservation =
    itemStatus === "Reserved"
      ? await prisma.stock_reservations.create({
          data: {
            item_id: item.item_id,
            user_id: customer.user.user_id,
            order_id: order.order_id,
            reserved_at: createdAt,
            expired_at: new Date("2026-07-22T09:00:00.000Z"),
            status: "Active",
          },
        })
      : null;

  return {
    ...catalog,
    customer,
    order,
    detail,
    item,
    initialHistory,
    payment,
    reservation,
  };
}

export async function snapshotSerialOrder(
  prisma: PrismaClient,
  orderId: number,
  variantId: number,
) {
  const [order, variant, items, reservations, histories, payments] =
    await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: orderId },
        select: {
          order_id: true,
          order_status: true,
          updated_at: true,
        },
      }),
      prisma.product_variants.findUnique({
        where: { variant_id: variantId },
        select: {
          variant_id: true,
          stock_quantity: true,
        },
      }),
      prisma.product_items.findMany({
        where: { variant_id: variantId },
        orderBy: { item_id: "asc" },
        select: {
          item_id: true,
          status: true,
          order_detail_id: true,
          serial_number: true,
        },
      }),
      prisma.stock_reservations.findMany({
        where: { order_id: orderId },
        orderBy: { reservation_id: "asc" },
        select: {
          reservation_id: true,
          item_id: true,
          order_id: true,
          status: true,
        },
      }),
      prisma.order_status_history.findMany({
        where: { order_id: orderId },
        orderBy: { history_id: "asc" },
        select: {
          history_id: true,
          old_status: true,
          new_status: true,
          note: true,
        },
      }),
      prisma.payment_transactions.findMany({
        where: { order_id: orderId },
        orderBy: { transaction_id: "asc" },
        select: {
          transaction_id: true,
          status: true,
          paid_at: true,
        },
      }),
    ]);

  return {
    order: order
      ? {
          ...order,
          updated_at: order.updated_at.toISOString(),
        }
      : null,
    variant,
    items,
    reservations,
    histories,
    payments: payments.map((payment) => ({
      ...payment,
      paid_at: payment.paid_at?.toISOString() ?? null,
    })),
  };
}

export async function installInventoryAuditFailureTrigger(
  prisma: PrismaClient,
  input: {
    actor: AccountFixture;
    action: "CREATE_INVENTORY_RECEIPT" | "ADJUST_STOCK";
  },
) {
  const actorId = input.actor.userId;
  const functionName = `test_fail_inventory_audit_${actorId}_${input.action.toLowerCase()}`;
  const triggerName = `${functionName}_trigger`;

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${functionName}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.user_id = ${actorId}
         AND NEW.action = '${input.action}' THEN
        RAISE EXCEPTION 'controlled inventory audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);

  return { functionName, triggerName };
}

export async function removeInventoryAuditFailureTrigger(
  prisma: PrismaClient,
  trigger: {
    functionName: string;
    triggerName: string;
  },
) {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${trigger.triggerName} ON audit_logs`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS ${trigger.functionName}()`,
  );
}
