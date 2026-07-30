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
  expectSafeShipmentError,
} from "./shipment-test-helpers";

describe.sequential("Shipment tracking integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("SHP-TRK-001 valid provider and tracking update is trimmed, audited and does not append status history", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "trackingvalid",
      orderStatus: "Processing",
      shipmentStatus: "Preparing",
      trackingCode: null,
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(
          `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
        )
        .send({
          shippingProvider: "  Carrier One  ",
          trackingCode: "  TRACK-VALID-001  ",
        }),
      createFixtureToken(manifest.accounts.staff_active),
    );
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      shippingProvider: "Carrier One",
      trackingCode: "TRACK-VALID-001",
    });
    expect(after.shipments[0]?.shipment_status_history).toEqual(
      before.shipments[0]?.shipment_status_history,
    );
    expect(after.order).toEqual(before.order);
    expect(after.payments).toEqual(before.payments);
    expect(after.details).toEqual(before.details);
    expect(
      await prisma.audit_logs.count({
        where: {
          entity_type: "shipments",
          entity_id: scenario.shipment!.shipment_id,
          action: "UPDATE_SHIPMENT",
          user_id: manifest.accounts.staff_active.userId,
        },
      }),
    ).toBe(1);
  });

  test("SHP-TRK-002 duplicate tracking returns controlled 409 and preserves both shipments", async () => {
    const existing = await createShipmentDeliveryScenario(prisma, {
      label: "trackingduplicatea",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
      trackingCode: "TRACK-UNIQUE-ONE",
    });
    const target = await createShipmentDeliveryScenario(prisma, {
      label: "trackingduplicateb",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
      trackingCode: "TRACK-UNIQUE-TWO",
    });
    const beforeExisting = await snapshotShipmentOrder(
      prisma,
      existing.order.order_id,
    );
    const beforeTarget = await snapshotShipmentOrder(
      prisma,
      target.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(`/api/admin/shipments/${target.shipment!.shipment_id}`)
        .send({ trackingCode: existing.shipment!.tracking_code }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(409);
    expectFailureEnvelope(response.body);
    expect(
      await snapshotShipmentOrder(prisma, existing.order.order_id),
    ).toEqual(beforeExisting);
    expect(
      await snapshotShipmentOrder(prisma, target.order.order_id),
    ).toEqual(beforeTarget);
  });

  test("SHP-TRK-003 blank and whitespace-only tracking are rejected without clearing the persisted code", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "trackingblank",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
      trackingCode: "TRACK-KEEP-ME",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const responses = [];

    for (const trackingCode of ["", "   "]) {
      responses.push(
        await authorize(
          request(adminApp)
            .patch(
              `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
            )
            .send({ trackingCode }),
          createFixtureToken(manifest.accounts.admin_active),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-TRK-004 non-string tracking/provider runtime types return sanitized 400 and do not mutate", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "trackingtypes",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const payloads: Array<Record<string, unknown>> = [
      { trackingCode: 123 },
      { trackingCode: true },
      { trackingCode: ["TRACK"] },
      { trackingCode: { value: "TRACK" } },
      { shippingProvider: 123 },
      { shippingProvider: false },
    ];
    const responses = [];

    for (const payload of payloads) {
      responses.push(
        await authorize(
          request(adminApp)
            .patch(
              `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
            )
            .send(payload),
          createFixtureToken(manifest.accounts.admin_active),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400, 400, 400,
    ]);
    responses.forEach((response) => expectSafeShipmentError(response.body));
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-TRK-005 overlong tracking returns controlled 400 without exposing persistence details", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "trackinglength",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
      trackingCode: "TRACK-BEFORE-LENGTH",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(`/api/admin/shipments/${scenario.shipment!.shipment_id}`)
        .send({ trackingCode: "X".repeat(101) }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expectSafeShipmentError(response.body);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-TRK-006 Customer cannot mutate tracking through the admin route", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "trackingcustomer",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(`/api/admin/shipments/${scenario.shipment!.shipment_id}`)
        .send({ trackingCode: "CUSTOMER-CANNOT-SET" }),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(403);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-TRK-007 Delivered and Cancelled shipment tracking is immutable", async () => {
    const terminalStatuses = ["Delivered", "Cancelled"] as const;

    for (const [index, shipmentStatus] of terminalStatuses.entries()) {
      const scenario = await createShipmentDeliveryScenario(prisma, {
        label: `trackingterminal${index}`,
        orderStatus:
          shipmentStatus === "Delivered" ? "Completed" : "Cancelled",
        shipmentStatus,
      });
      const before = await snapshotShipmentOrder(
        prisma,
        scenario.order.order_id,
      );
      const response = await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
          )
          .send({ trackingCode: `TERMINAL-${index}` }),
        createFixtureToken(manifest.accounts.admin_active),
      );

      expect(response.status).toBe(400);
      expect(
        await snapshotShipmentOrder(prisma, scenario.order.order_id),
      ).toEqual(before);
    }
  });
});
