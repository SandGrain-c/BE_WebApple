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
import { authorize, expectSafeShipmentError } from "./shipment-test-helpers";

describe.sequential("Shipment status integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("SHP-STS-001 every documented shipment transition succeeds and appends exactly one history row", async () => {
    const transitions: Array<[ShipmentStatus, ShipmentStatus]> = [
      ["Pending", "Preparing"],
      ["Pending", "Cancelled"],
      ["Preparing", "Shipped"],
      ["Preparing", "Cancelled"],
      ["Shipped", "InTransit"],
      ["Shipped", "Delivered"],
      ["Shipped", "Failed"],
      ["InTransit", "Delivered"],
      ["InTransit", "Failed"],
      ["Failed", "InTransit"],
      ["Failed", "Cancelled"],
    ];

    for (const [index, [from, to]] of transitions.entries()) {
      const scenario = await createShipmentDeliveryScenario(prisma, {
        label: `statusvalid${index}`,
        orderStatus:
          from === "Pending" || from === "Preparing"
            ? "Processing"
            : "Shipping",
        shipmentStatus: from,
      });
      const beforeCount =
        await prisma.shipment_status_history.count({
          where: { shipment_id: scenario.shipment!.shipment_id },
        });
      const response = await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
          )
          .send({
            status: to,
            location: "  Transition location  ",
            note: "  Transition note  ",
          }),
        createFixtureToken(manifest.accounts.staff_active),
      );
      const shipment = await prisma.shipments.findUnique({
        where: { shipment_id: scenario.shipment!.shipment_id },
        include: { shipment_status_history: true },
      });

      expect(response.status).toBe(200);
      expect(shipment?.status).toBe(to);
      expect(shipment?.shipment_status_history).toHaveLength(
        beforeCount + 1,
      );
    }
  });

  test("SHP-STS-002 skipped, terminal reversal and unsupported transitions return 400 without mutation", async () => {
    const transitions: Array<[ShipmentStatus, ShipmentStatus]> = [
      ["Pending", "Delivered"],
      ["Preparing", "Delivered"],
      ["InTransit", "Cancelled"],
      ["Delivered", "InTransit"],
      ["Delivered", "Pending"],
      ["Cancelled", "Delivered"],
      ["Cancelled", "InTransit"],
    ];

    for (const [index, [from, to]] of transitions.entries()) {
      const scenario = await createShipmentDeliveryScenario(prisma, {
        label: `statusinvalid${index}`,
        orderStatus:
          from === "Delivered"
            ? "Completed"
            : from === "Cancelled"
              ? "Cancelled"
              : "Shipping",
        shipmentStatus: from,
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
          .send({ status: to }),
        createFixtureToken(manifest.accounts.admin_active),
      );

      expect(response.status).toBe(400);
      expect(
        await snapshotShipmentOrder(prisma, scenario.order.order_id),
      ).toEqual(before);
    }
  });

  test("SHP-STS-003 same-state update is rejected without duplicate history or side effects", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "statussame",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
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
        .send({ status: "InTransit" }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(409);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-STS-004 invalid enum and non-string runtime status types return controlled 400", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "statustypes",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const payloads: Array<Record<string, unknown>> = [
      {},
      { status: "Unknown" },
      { status: 3 },
      { status: true },
      { status: ["Preparing"] },
      { status: { value: "Preparing" } },
    ];
    const responses = [];

    for (const payload of payloads) {
      responses.push(
        await authorize(
          request(adminApp)
            .patch(
              `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
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

  test("SHP-STS-005 Customer and unknown role are forbidden before status validation or mutation", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "statusrbac",
      orderStatus: "Processing",
      shipmentStatus: "Pending",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const responses = [];

    for (const account of [
      manifest.accounts.customer_active,
      manifest.accounts.unknown_role_active,
    ]) {
      responses.push(
        await authorize(
          request(adminApp)
            .patch(
              `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
            )
            .send({ status: "invalid-before-controller" }),
          createFixtureToken(account),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([403, 403]);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });

  test("SHP-CON-002 concurrent Delivered transition has one side-effect winner", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "statusconcurrent",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      paymentGateway: "COD",
      paymentStatus: "Pending",
      withAssignedSerial: true,
    });
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`;
    const responses = await Promise.all([
      authorize(request(adminApp).patch(endpoint), token).send({
        status: "Delivered",
      }),
      authorize(request(adminApp).patch(endpoint), token).send({
        status: "Delivered",
      }),
    ]);
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(after.shipments[0]?.status).toBe("Delivered");
    expect(
      after.shipments[0]?.shipment_status_history.filter(
        (history) => history.status === "Delivered",
      ),
    ).toHaveLength(1);
    expect(
      after.orderHistory.filter(
        (history) => history.new_status === "Completed",
      ),
    ).toHaveLength(1);
    expect(
      after.payments.filter((payment) => payment.status === "Success"),
    ).toHaveLength(1);
  });

  test("SHP-CON-003 concurrent cancellation and delivery produce one consistent terminal state", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "statuscancelrace",
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
    const token = createFixtureToken(manifest.accounts.admin_active);
    const base = `/api/admin/shipments/${scenario.shipment!.shipment_id}`;
    const responses = await Promise.all([
      authorize(request(adminApp).delete(base), token),
      authorize(request(adminApp).patch(`${base}/status`), token).send({
        status: "Delivered",
      }),
    ]);
    const after = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const terminalHistories =
      after.shipments[0]?.shipment_status_history.filter((history) =>
        ["Cancelled", "Delivered"].includes(history.status),
      ) ?? [];

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(terminalHistories).toHaveLength(1);
    expect(["Cancelled", "Delivered"]).toContain(
      after.shipments[0]?.status,
    );
    if (after.shipments[0]?.status === "Cancelled") {
      expect(after.order?.order_status).toBe(before.order?.order_status);
      expect(after.payments).toEqual(before.payments);
    } else {
      expect(after.order?.order_status).toBe("Completed");
      expect(after.payments[0]?.status).toBe("Success");
    }
  });
});
