import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createShipmentDeliveryScenario,
  snapshotShipmentOrder,
} from "../../factories/shipment-delivery.factory";
import { createFixtureToken } from "../../security/security-test-helpers";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import {
  authorize,
  expectFailureEnvelope,
} from "./shipment-test-helpers";

describe.sequential("Shipment creation integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("SHP-CRT-001 valid COD shipment is server-initialized, audited and synchronized without stock/payment mutation", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createvalid",
      orderStatus: "Confirmed",
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
        .post("/api/admin/shipments")
        .send({
          orderId: scenario.order.order_id,
          shippingProvider: "  Test Carrier  ",
          trackingCode: `  CRT-${scenario.namespace}  `,
          location: "  Fulfillment center  ",
          note: "  Created for dispatch  ",
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const created = after.shipments[0];

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      orderId: scenario.order.order_id,
      status: "Pending",
      shippingProvider: "Test Carrier",
      trackingCode: `CRT-${scenario.namespace}`,
    });
    expect(created).toMatchObject({
      order_id: scenario.order.order_id,
      status: "Pending",
    });
    expect(created?.shipment_status_history).toHaveLength(1);
    expect(after.order?.order_status).toBe("Processing");
    expect(
      after.orderHistory.filter(
        (history) =>
          history.old_status === "Confirmed" &&
          history.new_status === "Processing",
      ),
    ).toHaveLength(1);
    expect(after.payments).toEqual(before.payments);
    expect(after.details).toEqual(before.details);
    expect(
      await prisma.audit_logs.count({
        where: {
          entity_type: "shipments",
          entity_id: created?.shipment_id,
          action: "CREATE_SHIPMENT",
          user_id: manifest.accounts.admin_active.userId,
        },
      }),
    ).toBe(1);
  });

  test("SHP-CRT-002 nonexistent order returns 404 and creates no shipment, history or audit", async () => {
    const before = {
      shipments: await prisma.shipments.count(),
      histories: await prisma.shipment_status_history.count(),
      audits: await prisma.audit_logs.count(),
    };
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({ orderId: 2_147_483_647 }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(404);
    expect({
      shipments: await prisma.shipments.count(),
      histories: await prisma.shipment_status_history.count(),
      audits: await prisma.audit_logs.count(),
    }).toEqual(before);
  });

  test("SHP-CRT-003 cancelled, completed and pre-confirmation orders are rejected without mutation", async () => {
    const statuses = [
      "Cancelled",
      "Completed",
      "PendingPayment",
      "PendingConfirmation",
    ] as const;

    for (const [index, orderStatus] of statuses.entries()) {
      const scenario = await createShipmentDeliveryScenario(prisma, {
        label: `createblocked${index}`,
        orderStatus,
      });
      const before = await snapshotShipmentOrder(
        prisma,
        scenario.order.order_id,
      );
      const response = await authorize(
        request(adminApp)
          .post("/api/admin/shipments")
          .send({ orderId: scenario.order.order_id }),
        createFixtureToken(manifest.accounts.admin_active),
      );

      expect(response.status).toBe(400);
      expect(
        await snapshotShipmentOrder(prisma, scenario.order.order_id),
      ).toEqual(before);
    }
  });

  test("SHP-CRT-004 confirmed online order with non-successful payment is not eligible for shipment", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createunpaidonline",
      orderStatus: "Confirmed",
      paymentGateway: "payOS",
      paymentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({ orderId: scenario.order.order_id }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CRT-005 duplicate order shipment returns controlled 409 and preserves the existing row", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createduplicate",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({ orderId: scenario.order.order_id }),
      createFixtureToken(manifest.accounts.staff_active),
    );

    expect(response.status).toBe(409);
    expectFailureEnvelope(response.body);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CRT-006 duplicate tracking returns controlled 409 and no partial mutation", async () => {
    const existing = await createShipmentDeliveryScenario(prisma, {
      label: "createtrackingexisting",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
      trackingCode: "TRACKING-DUPLICATE",
    });
    const target = await createShipmentDeliveryScenario(prisma, {
      label: "createtrackingtarget",
      orderStatus: "Confirmed",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      target.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({
          orderId: target.order.order_id,
          trackingCode: existing.shipment!.tracking_code,
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(409);
    expect(
      await snapshotShipmentOrder(prisma, target.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CRT-007 runtime-coercible orderId is rejected with 400 and no mutation", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createcoercion",
      orderStatus: "Confirmed",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({ orderId: String(scenario.order.order_id) }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CRT-008 blank tracking code is rejected rather than normalized into an untracked shipment", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createblanktracking",
      orderStatus: "Confirmed",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({
          orderId: scenario.order.order_id,
          trackingCode: "   ",
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CRT-009 client-selected terminal status and internal-looking fields are rejected without mutation", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createmassassign",
      orderStatus: "Confirmed",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/shipments")
        .send({
          orderId: scenario.order.order_id,
          status: "Delivered",
          deliveredAt: "2020-01-01T00:00:00.000Z",
          createdBy: manifest.accounts.customer_b.userId,
          internalMetadata: { secret: "client-value" },
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CON-001 concurrent creation for one order has one winner and one controlled conflict", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "createconcurrent",
      orderStatus: "Confirmed",
    });
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = "/api/admin/shipments";
    const responses = await Promise.all([
      authorize(request(adminApp).post(endpoint), token).send({
        orderId: scenario.order.order_id,
        trackingCode: `CON-A-${scenario.namespace}`,
      }),
      authorize(request(adminApp).post(endpoint), token).send({
        orderId: scenario.order.order_id,
        trackingCode: `CON-B-${scenario.namespace}`,
      }),
    ]);
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(after.shipments).toHaveLength(1);
    expect(after.shipments[0]?.shipment_status_history).toHaveLength(1);
    expect(
      after.orderHistory.filter(
        (history) =>
          history.old_status === "Confirmed" &&
          history.new_status === "Processing",
      ),
    ).toHaveLength(1);
  });
});
