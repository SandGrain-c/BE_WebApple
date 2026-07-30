import type { PrismaClient } from "../../src/generated/prisma/client";
import type { AccountFixture } from "../fixtures/fixture-manifest";

export const ORDER_STATUSES = [
  "PendingPayment",
  "PendingConfirmation",
  "Confirmed",
  "Processing",
  "Shipping",
  "Completed",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

let fixtureCounter = 0;

function nextNamespace(label: string) {
  fixtureCounter += 1;
  const safeLabel =
    label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "order";

  return `${safeLabel}${fixtureCounter}`;
}

function fixturePhone(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return `08${(hash >>> 0).toString().padStart(8, "0").slice(-8)}`;
}

export async function createOrderCustomer(
  prisma: PrismaClient,
  label: string,
  status = 1,
) {
  const namespace = nextNamespace(label);
  const role = await prisma.roles.findUnique({
    where: { role_name: "Customer" },
  });

  if (!role) {
    throw new Error("Customer role fixture is required");
  }

  const user = await prisma.users.create({
    data: {
      role_id: role.role_id,
      user_name: `ord_${namespace}`.slice(0, 25),
      email: `${namespace}@order.test.invalid`,
      phone: fixturePhone(`${namespace}-customer`),
      full_name: `Order Test ${namespace}`,
      pass_hash: "test-only-unused-hash",
      status,
    },
  });
  const account: AccountFixture = {
    userId: user.user_id,
    roleName: "Customer",
    status: user.status,
    userName: user.user_name,
    email: user.email!,
    phone: user.phone!,
  };

  return { namespace, user, account };
}

export async function createOrderActor(
  prisma: PrismaClient,
  input: {
    label: string;
    roleName: "Admin" | "Staff" | "WarehouseStaff";
    status?: number;
  },
) {
  const namespace = nextNamespace(input.label);
  const role = await prisma.roles.findUnique({
    where: { role_name: input.roleName },
  });

  if (!role) {
    throw new Error(`${input.roleName} role fixture is required`);
  }

  const user = await prisma.users.create({
    data: {
      role_id: role.role_id,
      user_name: `act_${namespace}`.slice(0, 25),
      email: `${namespace}@actor.test.invalid`,
      phone: fixturePhone(`${namespace}-actor`),
      full_name: `Order Actor ${namespace}`,
      pass_hash: "test-only-unused-hash",
      status: input.status ?? 1,
    },
  });
  const account: AccountFixture = {
    userId: user.user_id,
    roleName: input.roleName,
    status: user.status,
    userName: user.user_name,
    email: user.email!,
    phone: user.phone!,
  };

  return { namespace, user, account };
}

export async function createOrderLifecycleScenario(
  prisma: PrismaClient,
  input: {
    label: string;
    customerId: number;
    status: OrderStatus;
    quantity?: number;
    unitPrice?: number;
    currentPrice?: number;
    stockQuantity?: number;
    createdAt?: Date;
    paymentGateway?: "COD" | "payOS";
    paymentStatus?: string;
    shipmentStatus?: string | null;
  },
) {
  const namespace = nextNamespace(input.label);
  const quantity = input.quantity ?? 2;
  const unitPrice = input.unitPrice ?? 2_500;
  const currentPrice = input.currentPrice ?? unitPrice;
  const stockQuantity = input.stockQuantity ?? 20;
  const createdAt =
    input.createdAt ?? new Date("2026-07-20T08:00:00.000Z");

  const category = await prisma.categories.create({
    data: {
      category_name: `Order Category ${namespace}`,
      slug: `order-category-${namespace}`,
      description: "Order lifecycle integration fixture",
      display_order: fixtureCounter,
      is_active: false,
    },
  });
  const product = await prisma.products.create({
    data: {
      category_id: category.category_id,
      name: `Order Product ${namespace}`,
      slug: `order-product-${namespace}`,
      description: "Order lifecycle integration product",
      is_active: false,
      created_at: createdAt,
    },
  });
  const variant = await prisma.product_variants.create({
    data: {
      product_id: product.product_id,
      variant_name: `Order Variant ${namespace}`,
      sku: `ORD-${namespace}`.toUpperCase().slice(0, 50),
      color: "Test Blue",
      capacity: "256GB",
      ram: "8GB",
      country: "VN",
      price: currentPrice,
      stock_quantity: stockQuantity,
    },
  });
  const subTotal = unitPrice * quantity;
  const order = await prisma.orders.create({
    data: {
      user_id: input.customerId,
      order_code: `LIFE-${namespace}`.toUpperCase().slice(0, 50),
      sub_total: subTotal,
      shipping_fee: 0,
      discount_amount: 0,
      total_amount: subTotal,
      order_status: input.status,
      customer_name: `Snapshot Customer ${namespace}`,
      customer_phone: fixturePhone(`${namespace}-snapshot`),
      shipping_address: `Snapshot Address ${namespace}`,
      created_at: createdAt,
      updated_at: createdAt,
    },
  });
  const detail = await prisma.order_details.create({
    data: {
      order_id: order.order_id,
      variant_id: variant.variant_id,
      quantity,
      unit_price: unitPrice,
    },
  });
  const initialHistory = await prisma.order_status_history.create({
    data: {
      order_id: order.order_id,
      old_status: null,
      new_status: input.status,
      changed_by: input.customerId,
      note: `Initial fixture state ${input.status}`,
      created_at: createdAt,
    },
  });
  const payment = await prisma.payment_transactions.create({
    data: {
      order_id: order.order_id,
      gateway: input.paymentGateway ?? "COD",
      transaction_ref: null,
      amount: subTotal,
      payment_type: "Payment",
      status: input.paymentStatus ?? "Pending",
      created_at: createdAt,
      updated_at: createdAt,
    },
  });

  let shipment = null;
  let shipmentHistory = null;

  if (input.shipmentStatus) {
    shipment = await prisma.shipments.create({
      data: {
        order_id: order.order_id,
        shipping_provider: "Manual",
        tracking_code: null,
        status: input.shipmentStatus,
        created_at: createdAt,
      },
    });
    shipmentHistory = await prisma.shipment_status_history.create({
      data: {
        shipment_id: shipment.shipment_id,
        status: input.shipmentStatus,
        location: "Test warehouse",
        note: "Initial shipment fixture",
        updated_at: createdAt,
      },
    });
  }

  return {
    namespace,
    category,
    product,
    variant,
    order,
    detail,
    initialHistory,
    payment,
    shipment,
    shipmentHistory,
    expected: {
      quantity,
      unitPrice,
      currentPrice,
      stockQuantity,
      subTotal,
      createdAt,
    },
  };
}

export async function snapshotOrderLifecycle(
  prisma: PrismaClient,
  orderId: number,
  variantId: number,
) {
  const [order, details, histories, payments, shipments, variant] =
    await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: orderId },
        select: {
          order_id: true,
          user_id: true,
          order_status: true,
          sub_total: true,
          shipping_fee: true,
          discount_amount: true,
          total_amount: true,
          updated_at: true,
        },
      }),
      prisma.order_details.findMany({
        where: { order_id: orderId },
        orderBy: { order_detail_id: "asc" },
        select: {
          order_detail_id: true,
          variant_id: true,
          quantity: true,
          unit_price: true,
        },
      }),
      prisma.order_status_history.findMany({
        where: { order_id: orderId },
        orderBy: { history_id: "asc" },
        select: {
          history_id: true,
          old_status: true,
          new_status: true,
          changed_by: true,
          note: true,
        },
      }),
      prisma.payment_transactions.findMany({
        where: { order_id: orderId },
        orderBy: { transaction_id: "asc" },
        select: {
          transaction_id: true,
          gateway: true,
          amount: true,
          status: true,
          paid_at: true,
        },
      }),
      prisma.shipments.findMany({
        where: { order_id: orderId },
        orderBy: { shipment_id: "asc" },
        include: {
          shipment_status_history: {
            orderBy: { shipment_history_id: "asc" },
          },
        },
      }),
      prisma.product_variants.findUnique({
        where: { variant_id: variantId },
        select: {
          variant_id: true,
          price: true,
          stock_quantity: true,
        },
      }),
    ]);

  return {
    order: order
      ? {
          ...order,
          sub_total: Number(order.sub_total),
          shipping_fee: Number(order.shipping_fee),
          discount_amount: Number(order.discount_amount),
          total_amount: Number(order.total_amount),
          updated_at: order.updated_at.toISOString(),
        }
      : null,
    details: details.map((detail) => ({
      ...detail,
      unit_price: Number(detail.unit_price),
    })),
    histories,
    payments: payments.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
    shipments,
    variant: variant
      ? {
          ...variant,
          price: Number(variant.price),
        }
      : null,
  };
}

export async function installOrderHistoryFailureTrigger(
  prisma: PrismaClient,
  orderId: number,
  marker: string,
) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("A positive orderId is required for the failure trigger");
  }

  const safeMarker =
    marker.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
    "order_history";
  const functionName = `test_fail_${safeMarker}_fn`;
  const triggerName = `test_fail_${safeMarker}_trg`;

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.order_id = ${orderId} THEN
        RAISE EXCEPTION 'controlled order history failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);

  return { functionName, triggerName };
}

export async function removeOrderHistoryFailureTrigger(
  prisma: PrismaClient,
  names: { functionName: string; triggerName: string },
) {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${names.triggerName} ON order_status_history`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS ${names.functionName}()`,
  );
}
