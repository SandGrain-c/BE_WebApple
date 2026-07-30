import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createShipmentDeliveryScenario,
  installShipmentAuditFailureTrigger,
  installShipmentCreateHistoryFailureTrigger,
  installShipmentHistoryFailureTrigger,
  removeShipmentFailureTrigger,
  snapshotShipmentOrder,
} from "../../factories/shipment-delivery.factory";
import { createFixtureToken } from "../../security/security-test-helpers";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { authorize, expectSafeShipmentError } from "./shipment-test-helpers";

describe.sequential("Shipment transaction rollback and error sanitation", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("SHP-TXN-001 creation history failure rolls back shipment, order transition and audit with sanitized 500", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "txncreate",
      orderStatus: "Confirmed",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const trigger = await installShipmentCreateHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
      `shp_create_${scenario.order.order_id}`,
    );
    let response;

    try {
      response = await authorize(
        request(adminApp)
          .post("/api/admin/shipments")
          .send({ orderId: scenario.order.order_id }),
        createFixtureToken(manifest.accounts.admin_active),
      );
    } finally {
      await removeShipmentFailureTrigger(prisma, {
        ...trigger,
        table: "shipment_status_history",
      });
    }

    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý yêu cầu thất bại",
    });
    expectSafeShipmentError(response.body);
  });

  test("SHP-TXN-002 status-history failure rolls back shipment, order, COD payment and histories with sanitized 500", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "txnstatus",
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
    const trigger = await installShipmentHistoryFailureTrigger(
      prisma,
      scenario.shipment!.shipment_id,
      `shp_status_${scenario.shipment!.shipment_id}`,
    );
    let response;

    try {
      response = await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${scenario.shipment!.shipment_id}/status`,
          )
          .send({ status: "Delivered" }),
        createFixtureToken(manifest.accounts.admin_active),
      );
    } finally {
      await removeShipmentFailureTrigger(prisma, {
        ...trigger,
        table: "shipment_status_history",
      });
    }

    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý yêu cầu thất bại",
    });
    expectSafeShipmentError(response.body);
  });

  test("SHP-TXN-003 audit failure rolls back tracking/provider update with sanitized 500", async () => {
    const scenario = await createShipmentDeliveryScenario(prisma, {
      label: "txntracking",
      orderStatus: "Processing",
      shipmentStatus: "Preparing",
      trackingCode: "TRACK-BEFORE-TXN",
    });
    const before = await snapshotShipmentOrder(
      prisma,
      scenario.order.order_id,
    );
    const trigger = await installShipmentAuditFailureTrigger(
      prisma,
      scenario.shipment!.shipment_id,
      `shp_audit_${scenario.shipment!.shipment_id}`,
    );
    let response;

    try {
      response = await authorize(
        request(adminApp)
          .patch(
            `/api/admin/shipments/${scenario.shipment!.shipment_id}`,
          )
          .send({
            shippingProvider: "Changed Carrier",
            trackingCode: "TRACK-AFTER-TXN",
          }),
        createFixtureToken(manifest.accounts.admin_active),
      );
    } finally {
      await removeShipmentFailureTrigger(prisma, {
        ...trigger,
        table: "audit_logs",
      });
    }

    expect(
      await snapshotShipmentOrder(prisma, scenario.order.order_id),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý yêu cầu thất bại",
    });
    expectSafeShipmentError(response.body);
  });
});
