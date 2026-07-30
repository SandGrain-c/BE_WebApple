import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createShipmentDeliveryScenario,
  snapshotShipmentOrder,
  type ShipmentStatus,
} from "../../factories/shipment-delivery.factory";
import { createFixtureToken } from "../../security/security-test-helpers";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { authorize } from "./shipment-test-helpers";

describe.sequential("Order and shipment synchronization", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("SHP-SYNC-001 Preparing, Shipped and InTransit synchronize their documented order states", async () => {
    const transitions: Array<{
      from: ShipmentStatus;
      to: ShipmentStatus;
      orderBefore: "Confirmed" | "Processing";
      orderAfter: "Processing" | "Shipping";
    }> = [
      {
        from: "Pending",
        to: "Preparing",
        orderBefore: "Confirmed",
        orderAfter: "Processing",
      },
      {
        from: "Preparing",
        to: "Shipped",
        orderBefore: "Processing",
        orderAfter: "Shipping",
      },
      {
        from: "Shipped",
        to: "InTransit",
        orderBefore: "Processing",
        orderAfter: "Shipping",
      },
    ];

    for (const [index, transition] of transitions.entries()) {
      const scenario = await createShipmentDeliveryScenario(prisma, {
        label: `syncorder${index}`,
        orderStatus: transition.orderBefore,
        shipmentStatus: transition.from,
      });
      const response = await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
          )
          .send({ status: transition.to }),
        createFixtureToken(manifest.accounts.admin_active),
      );
      const after = await snapshotShipmentOrder(
        prisma,
        scenario.order.order_id,
      );

      expect(response.status).toBe(200);
      expect(after.order?.order_status).toBe(transition.orderAfter);
      expect(
        after.orderHistory.filter(
          (history) => history.new_status === transition.orderAfter,
        ),
      ).toHaveLength(1);
    }
  });

  test("SHP-SYNC-002 Delivered completes the order and settles pending COD exactly once without changing stock", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "synccod",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      paymentGateway: "COD",
      paymentStatus: "Pending",
      withAssignedSerial: true,
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(
          `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
        )
        .send({ status: "Delivered" }),
      createFixtureToken(manifest.accounts.admin_active),
    );
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(response.status).toBe(200);
    expect(after.shipments[0]?.status).toBe("Delivered");
    expect(after.order?.order_status).toBe("Completed");
    expect(after.payments[0]).toMatchObject({
      gateway: "COD",
      status: "Success",
    });
    expect(after.payments[0]?.paid_at).not.toBeNull();
    expect(after.details[0]?.variant).toEqual(
      before.details[0]?.variant,
    );
    expect(after.details[0]?.productItems).toEqual(
      before.details[0]?.productItems,
    );
  });

  test("SHP-SYNC-003 Delivered does not rewrite an already-successful online payment", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "synconline",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      paymentGateway: "payOS",
      paymentStatus: "Success",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(
          `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
        )
        .send({ status: "Delivered" }),
      createFixtureToken(manifest.accounts.staff_active),
    );
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(response.status).toBe(200);
    expect(after.order?.order_status).toBe("Completed");
    expect(after.payments).toEqual(before.payments);
  });

  test("SHP-SYNC-004 cancelling an eligible shipment does not implicitly cancel order, refund payment or restore stock/serial", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "synccancel",
      orderStatus: "Processing",
      shipmentStatus: "Preparing",
      paymentGateway: "COD",
      paymentStatus: "Pending",
      withAssignedSerial: true,
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp).delete(
        `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
      ),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(response.status).toBe(200);
    expect(after.shipments[0]?.status).toBe("Cancelled");
    expect(after.order).toEqual(before.order);
    expect(after.payments).toEqual(before.payments);
    expect(after.details).toEqual(before.details);
  });

  test("SHP-SYNC-005 completed or cancelled orders cannot be moved by shipment status operations", async () => {
    const completed = await createShipmentDeliveryScenario(prisma, {
      label: "synccompleted",
      orderStatus: "Completed",
      shipmentStatus: "Delivered",
    });
    const cancelled = await createShipmentDeliveryScenario(prisma, {
      label: "synccancelledorder",
      orderStatus: "Cancelled",
      shipmentStatus: "Pending",
    });
    const beforeCompleted = await snapshotShipmentOrder(
      prisma,
      completed.order.order_id,
    );
    const beforeCancelled = await snapshotShipmentOrder(
      prisma,
      cancelled.order.order_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const responses = [
      await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${completed.shipment!.shipment_id}/status`,
          )
          .send({ status: "InTransit" }),
        token,
      ),
      await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${cancelled.shipment!.shipment_id}/status`,
          )
          .send({ status: "Preparing" }),
        token,
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    expect(
      await snapshotShipmentOrder(prisma, completed.order.order_id),
    ).toEqual(beforeCompleted);
    expect(
      await snapshotShipmentOrder(prisma, cancelled.order.order_id),
    ).toEqual(beforeCancelled);
  });
});
