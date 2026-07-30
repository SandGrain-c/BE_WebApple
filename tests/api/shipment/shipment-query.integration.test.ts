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

describe.sequential("Shipment query integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;
  let customerApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  test("SHP-QRY-001 missing and invalid tokens are rejected on admin and customer shipment routes", async () => {
    const responses = [
      await request(adminApp).get("/api/admin/shipments"),
      await authorize(
        request(adminApp).get("/api/admin/shipments"),
        "invalid-token",
      ),
      await request(customerApp).get("/api/shipments/1"),
      await authorize(
        request(customerApp).get("/api/shipments/1"),
        "invalid-token",
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
    responses.forEach((response) => expectFailureEnvelope(response.body));
  });

  test("SHP-QRY-002 locked accounts are rejected before shipment lookup", async () => {
    const adminResponse = await authorize(
      request(adminApp).get("/api/admin/shipments"),
      createFixtureToken(manifest.accounts.admin_locked),
    );
    const customerResponse = await authorize(
      request(customerApp).get("/api/shipments/1"),
      createFixtureToken(manifest.accounts.customer_locked),
    );

    expect([adminResponse.status, customerResponse.status]).toEqual([
      401, 401,
    ]);
  });

  test("SHP-QRY-003 admin shipment RBAC permits Staff and WarehouseStaff while denying Customer and unknown roles", async () => {
    const permitted = [
      manifest.accounts.staff_active,
      manifest.accounts.warehouse_active,
    ];
    const denied = [
      manifest.accounts.customer_active,
      manifest.accounts.unknown_role_active,
    ];

    for (const account of permitted) {
      const response = await authorize(
        request(adminApp).get("/api/admin/shipments"),
        createFixtureToken(account),
      );
      expect(response.status).toBe(200);
    }

    for (const account of denied) {
      const response = await authorize(
        request(adminApp).get("/api/admin/shipments"),
        createFixtureToken(account),
      );
      expect(response.status).toBe(403);
    }
  });

  test("SHP-QRY-004 customer reads only own shipment and foreign shipment/order IDs are ownership-safe 404", async () => {
    const owner = await createShipmentDeliveryScenario(prisma, {
      label: "queryowner",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      trackingCode: "OWNER-PRIVATE-TRACKING",
    });
    const other = await createShipmentDeliveryScenario(prisma, {
      label: "queryother",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      trackingCode: "OTHER-PRIVATE-TRACKING",
    });
    const token = createFixtureToken(owner.customer.account);
    const ownResponse = await authorize(
      request(customerApp).get(
        `/api/shipments/${owner.shipment!.shipment_id}`,
      ),
      token,
    );
    const foreignByShipment = await authorize(
      request(customerApp).get(
        `/api/shipments/${other.shipment!.shipment_id}`,
      ),
      token,
    );
    const foreignByOrder = await authorize(
      request(customerApp).get(
        `/api/shipments/orders/${other.order.order_id}`,
      ),
      token,
    );
    const foreignSerialized = JSON.stringify([
      foreignByShipment.body,
      foreignByOrder.body,
    ]);

    expect(ownResponse.status).toBe(200);
    expect(ownResponse.body.data).toMatchObject({
      shipmentId: owner.shipment!.shipment_id,
      orderId: owner.order.order_id,
      trackingCode: "OWNER-PRIVATE-TRACKING",
    });
    expect([foreignByShipment.status, foreignByOrder.status]).toEqual([
      404, 404,
    ]);
    expect(foreignSerialized).not.toContain("OTHER-PRIVATE-TRACKING");
    expect(foreignSerialized).not.toContain(other.order.order_code);
    expect(foreignSerialized).not.toContain(other.order.customer_name!);
  });

  test("SHP-QRY-005 customer DTO omits audit, credential, carrier-internal, warehouse and unrelated customer fields", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "querydto",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
    });
    const response = await authorize(
      request(customerApp).get(
        `/api/shipments/${scenario.shipment!.shipment_id}`,
      ),
      createFixtureToken(scenario.customer.account),
    );
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(serialized).not.toMatch(
      /pass_hash|audit_logs|old_value|new_value|webhook|signature|cost_price|warehouse_id|gateway_response/i,
    );
  });

  test("SHP-QRY-006 valid pagination, status, order and sorting filters return a stable envelope", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "queryfilters",
      orderStatus: "Processing",
      shipmentStatus: "Preparing",
    });
    const response = await authorize(
      request(adminApp)
        .get("/api/admin/shipments")
        .query({
          page: "1",
          limit: "2",
          status: "Preparing",
          orderId: String(scenario.order.order_id),
          sort: "oldest",
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      limit: 2,
    });
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        shipmentId: scenario.shipment!.shipment_id,
        orderId: scenario.order.order_id,
        status: "Preparing",
      }),
    ]);
  });

  test("SHP-QRY-007 invalid pagination values return controlled 400 instead of silent fallback", async () => {
    const token = createFixtureToken(manifest.accounts.admin_active);
    const paths = [
      "/api/admin/shipments?page=0",
      "/api/admin/shipments?page=-1",
      "/api/admin/shipments?page=1.5",
      "/api/admin/shipments?page=true",
      "/api/admin/shipments?page%5Bvalue%5D=1",
      "/api/admin/shipments?limit=0",
      "/api/admin/shipments?limit=10001",
    ];
    const responses = [];

    for (const path of paths) {
      responses.push(
        await authorize(request(adminApp).get(path), token),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400, 400, 400, 400,
    ]);
    responses.forEach((response) => expectSafeShipmentError(response.body));
  });

  test("SHP-QRY-008 invalid status and orderId filters return controlled 400 without broadening the query", async () => {
    const token = createFixtureToken(manifest.accounts.admin_active);
    const beforeCount = await prisma.shipments.count();
    const responses = [
      await authorize(
        request(adminApp).get("/api/admin/shipments?status=Unknown"),
        token,
      ),
      await authorize(
        request(adminApp).get("/api/admin/shipments?orderId=text"),
        token,
      ),
      await authorize(
        request(adminApp).get("/api/admin/shipments?orderId=1.5"),
        token,
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(await prisma.shipments.count()).toBe(beforeCount);
  });

  test("SHP-QRY-009 customer query is read-only for shipment, order, payment, stock and serial state", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "queryreadonly",
      orderStatus: "Shipping",
      shipmentStatus: "InTransit",
      withAssignedSerial: true,
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const response = await authorize(
      request(customerApp).get(
        `/api/shipments/orders/${scenario.order.order_id}`,
      ),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(200);
    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
  });
});
