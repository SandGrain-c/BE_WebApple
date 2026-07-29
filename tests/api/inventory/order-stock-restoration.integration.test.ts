import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  PRODUCT_ITEM_STATUS,
  createSerialOrderScenario,
  snapshotSerialOrder,
} from "../../factories/inventory-serial.factory";
import {
  installOrderHistoryFailureTrigger,
  removeOrderHistoryFailureTrigger,
} from "../../factories/order-lifecycle.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

describe.sequential("Order cancellation serialized-stock restoration", () => {
  let customerApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  test("INV-RST-001 cancelling an order restores counter and releases its assigned serial/reservation in one transaction", async () => {
    const scenario = await createSerialOrderScenario(prisma, {
      label: "restoreassigned",
    });
    const response = await authorize(
      request(customerApp).patch(
        `/api/orders/${scenario.order.order_id}/cancel`,
      ),
      createFixtureToken(scenario.customer.account),
    );
    const after = await snapshotSerialOrder(
      prisma,
      scenario.order.order_id,
      scenario.serializedVariant.variant_id,
    );
    const assignedItem = after.items.find(
      (item) => item.item_id === scenario.item.item_id,
    );

    expect(response.status).toBe(200);
    expect(after.order?.order_status).toBe("Cancelled");
    expect(after.variant?.stock_quantity).toBe(2);
    expect(assignedItem).toMatchObject({
      status: PRODUCT_ITEM_STATUS.InStock,
      order_detail_id: null,
    });
    expect(after.reservations).toEqual([
      expect.objectContaining({
        reservation_id: scenario.reservation?.reservation_id,
        status: "Released",
      }),
    ]);
    expect(
      after.histories.filter(
        (history) => history.new_status === "Cancelled",
      ),
    ).toHaveLength(1);
  });

  test("INV-RST-002 concurrent double cancellation restores stock and serial exactly once", async () => {
    const scenario = await createSerialOrderScenario(prisma, {
      label: "restoredouble",
    });
    const token = createFixtureToken(scenario.customer.account);
    const endpoint = `/api/orders/${scenario.order.order_id}/cancel`;
    const responses = await Promise.all([
      authorize(request(customerApp).patch(endpoint), token),
      authorize(request(customerApp).patch(endpoint), token),
    ]);
    const after = await snapshotSerialOrder(
      prisma,
      scenario.order.order_id,
      scenario.serializedVariant.variant_id,
    );
    const assignedItem = after.items.find(
      (item) => item.item_id === scenario.item.item_id,
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    expect(after.variant?.stock_quantity).toBe(2);
    expect(assignedItem).toMatchObject({
      status: PRODUCT_ITEM_STATUS.InStock,
      order_detail_id: null,
    });
    expect(after.reservations[0]?.status).toBe("Released");
    expect(
      after.histories.filter(
        (history) => history.new_status === "Cancelled",
      ),
    ).toHaveLength(1);
  });

  test("INV-RST-003 order-history failure rolls back order, payment, counter and serialized relations", async () => {
    const scenario = await createSerialOrderScenario(prisma, {
      label: "restorerollback",
    });
    const before = await snapshotSerialOrder(
      prisma,
      scenario.order.order_id,
      scenario.serializedVariant.variant_id,
    );
    const trigger = await installOrderHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
      `inventory_restore_${scenario.order.order_id}`,
    );
    let response;

    try {
      response = await authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        createFixtureToken(scenario.customer.account),
      );
    } finally {
      await removeOrderHistoryFailureTrigger(prisma, trigger);
    }

    expect(
      await snapshotSerialOrder(
        prisma,
        scenario.order.order_id,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý đơn hàng thất bại",
    });
  });

  test("INV-RST-004 a completed order cannot be cancelled and its Sold serial remains immutable", async () => {
    const scenario = await createSerialOrderScenario(prisma, {
      label: "restorecompleted",
      orderStatus: "Completed",
      itemStatus: "Sold",
    });
    const before = await snapshotSerialOrder(
      prisma,
      scenario.order.order_id,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(customerApp).patch(
        `/api/orders/${scenario.order.order_id}/cancel`,
      ),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotSerialOrder(
        prisma,
        scenario.order.order_id,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });
});
