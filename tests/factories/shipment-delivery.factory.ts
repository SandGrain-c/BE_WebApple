import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  createOrderCustomer,
  createOrderLifecycleScenario,
  type OrderStatus,
} from "./order-lifecycle.factory";

export const SHIPMENT_STATUSES = [
  "Pending",
  "Preparing",
  "Shipped",
  "InTransit",
  "Delivered",
  "Failed",
  "Cancelled",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

let shipmentFixtureCounter = 0;

function nextShipmentNamespace(label: string) {
  shipmentFixtureCounter += 1;
  const safeLabel =
    label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) ||
    "shipment";

  return `${safeLabel}${shipmentFixtureCounter}`;
}

export async function createShipmentDeliveryScenario(
  prisma: PrismaClient,
  input: {
    label: string;
    orderStatus?: OrderStatus;
    shipmentStatus?: ShipmentStatus;
    paymentGateway?: "COD" | "payOS";
    paymentStatus?: string;
    customerStatus?: number;
    trackingCode?: string | null;
    shippingProvider?: string | null;
    stockQuantity?: number;
    withAssignedSerial?: boolean;
  },
) {
  const namespace = nextShipmentNamespace(input.label);
  const customer = await createOrderCustomer(
    prisma,
    `shp${namespace}`,
    input.customerStatus ?? 1,
  );
  const orderScenario = await createOrderLifecycleScenario(prisma, {
    label: `shp${namespace}`,
    customerId: customer.user.user_id,
    status: input.orderStatus ?? "Confirmed",
    paymentGateway: input.paymentGateway ?? "COD",
    paymentStatus: input.paymentStatus ?? "Pending",
    stockQuantity: input.stockQuantity ?? 10,
  });

  const serial = input.withAssignedSerial
    ? await prisma.product_items.create({
        data: {
          variant_id: orderScenario.variant.variant_id,
          serial_number: `SHP-${namespace}-ASSIGNED`.toUpperCase().slice(0, 50),
          status: 2,
          order_detail_id: orderScenario.detail.order_detail_id,
        },
      })
    : null;

  let shipment = null;
  let shipmentHistory = null;

  if (input.shipmentStatus) {
    shipment = await prisma.shipments.create({
      data: {
        order_id: orderScenario.order.order_id,
        shipping_provider: input.shippingProvider ?? "Test Carrier",
        tracking_code:
          input.trackingCode === undefined
            ? `TRK-${namespace}`.toUpperCase().slice(0, 100)
            : input.trackingCode,
        status: input.shipmentStatus,
      },
    });
    shipmentHistory = await prisma.shipment_status_history.create({
      data: {
        shipment_id: shipment.shipment_id,
        status: input.shipmentStatus,
        location: "Test fulfillment center",
        note: "Deterministic shipment fixture",
      },
    });
  }

  return {
    namespace,
    customer,
    ...orderScenario,
    shipment,
    shipmentHistory,
    serial,
  };
}

export async function snapshotShipmentOrder(
  prisma: PrismaClient,
  orderId: number,
) {
  const [order, shipments, orderHistory, payments, details] =
    await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: orderId },
        select: {
          order_id: true,
          order_status: true,
          updated_at: true,
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
          status: true,
          paid_at: true,
          amount: true,
        },
      }),
      prisma.order_details.findMany({
        where: { order_id: orderId },
        orderBy: { order_detail_id: "asc" },
        include: {
          product_variants: {
            select: {
              variant_id: true,
              stock_quantity: true,
              price: true,
            },
          },
          product_items: {
            orderBy: { item_id: "asc" },
            select: {
              item_id: true,
              serial_number: true,
              status: true,
              order_detail_id: true,
            },
          },
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
    shipments,
    orderHistory,
    payments: payments.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      paid_at: payment.paid_at?.toISOString() ?? null,
    })),
    details: details.map((detail) => ({
      order_detail_id: detail.order_detail_id,
      quantity: detail.quantity,
      unit_price: Number(detail.unit_price),
      variant: {
        ...detail.product_variants,
        price: Number(detail.product_variants.price),
      },
      productItems: detail.product_items,
    })),
  };
}

export async function installShipmentHistoryFailureTrigger(
  prisma: PrismaClient,
  shipmentId: number,
  marker: string,
) {
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) {
    throw new Error("A positive shipmentId is required");
  }

  const safeMarker =
    marker.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
    "shipment_history";
  const functionName = `test_fail_${safeMarker}_fn`;
  const triggerName = `test_fail_${safeMarker}_trg`;

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.shipment_id = ${shipmentId} THEN
        RAISE EXCEPTION 'controlled shipment history failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON shipment_status_history
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);

  return { functionName, triggerName };
}

export async function installShipmentCreateHistoryFailureTrigger(
  prisma: PrismaClient,
  orderId: number,
  marker: string,
) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("A positive orderId is required");
  }

  const safeMarker =
    marker.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
    "shipment_create";
  const functionName = `test_fail_${safeMarker}_fn`;
  const triggerName = `test_fail_${safeMarker}_trg`;

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}()
    RETURNS trigger AS $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM shipments
        WHERE shipment_id = NEW.shipment_id AND order_id = ${orderId}
      ) THEN
        RAISE EXCEPTION 'controlled shipment creation history failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON shipment_status_history
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);

  return { functionName, triggerName };
}

export async function installShipmentAuditFailureTrigger(
  prisma: PrismaClient,
  shipmentId: number,
  marker: string,
) {
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) {
    throw new Error("A positive shipmentId is required");
  }

  const safeMarker =
    marker.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
    "shipment_audit";
  const functionName = `test_fail_${safeMarker}_fn`;
  const triggerName = `test_fail_${safeMarker}_trg`;

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.entity_type = 'shipments' AND NEW.entity_id = ${shipmentId} THEN
        RAISE EXCEPTION 'controlled shipment audit failure';
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

export async function removeShipmentFailureTrigger(
  prisma: PrismaClient,
  names: {
    functionName: string;
    triggerName: string;
    table: "shipment_status_history" | "audit_logs";
  },
) {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${names.triggerName} ON ${names.table}`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS ${names.functionName}()`,
  );
}
