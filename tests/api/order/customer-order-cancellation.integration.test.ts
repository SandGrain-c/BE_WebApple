import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createOrderCustomer,
  createOrderLifecycleScenario,
  installOrderHistoryFailureTrigger,
  removeOrderHistoryFailureTrigger,
  snapshotOrderLifecycle,
  type OrderStatus,
} from "../../factories/order-lifecycle.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeErrorBody(body: unknown) {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /controlled order history failure|pass_hash|JWT_SECRET|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE |\/Users\//i,
  );
}

describe.sequential("Customer order cancellation integration", () => {
  const manifest = inject("fixtureManifest");
  let customerApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  test("ORD-CAN-001 cancel rejects missing, invalid and locked-customer tokens without mutation", async () => {
    const customer = await createOrderCustomer(prisma, "canauth");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "canauthorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const path = `/api/orders/${scenario.order.order_id}/cancel`;
    const responses = [
      await request(customerApp).patch(path),
      await authorize(request(customerApp).patch(path), "invalid-token"),
      await authorize(
        request(customerApp).patch(path),
        createFixtureToken(manifest.accounts.customer_locked),
      ),
    ];
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401,
    ]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("ORD-CAN-002 nonexistent and cross-customer cancellations are IDOR-safe 404s", async () => {
    const customerA = await createOrderCustomer(prisma, "canidora");
    const customerB = await createOrderCustomer(prisma, "canidorb");
    const privateOrder = await createOrderLifecycleScenario(prisma, {
      label: "canprivateorder",
      customerId: customerB.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      privateOrder.order.order_id,
      privateOrder.variant.variant_id,
    );
    const token = createFixtureToken(customerA.account);
    const responses = [
      await authorize(
        request(customerApp).patch(
          `/api/orders/${privateOrder.order.order_id}/cancel`,
        ),
        token,
      ),
      await authorize(
        request(customerApp).patch(
          "/api/orders/2147483647/cancel",
        ),
        token,
      ),
    ];
    const after = await snapshotOrderLifecycle(
      prisma,
      privateOrder.order.order_id,
      privateOrder.variant.variant_id,
    );
    const serialized = JSON.stringify(responses.map((item) => item.body));

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(after).toEqual(before);
    expect(serialized).not.toContain(privateOrder.order.order_code);
    expect(serialized).not.toContain(privateOrder.order.customer_phone);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("ORD-CAN-003 allowed cancellations restore stock once and preserve detail snapshots", async () => {
    const statuses: OrderStatus[] = [
      "PendingPayment",
      "PendingConfirmation",
    ];

    for (const [index, status] of statuses.entries()) {
      const customer = await createOrderCustomer(
        prisma,
        `canallowedcustomer${index}`,
      );
      const scenario = await createOrderLifecycleScenario(prisma, {
        label: `canallowedorder${index}`,
        customerId: customer.user.user_id,
        status,
        quantity: 4,
        unitPrice: 3_250,
        currentPrice: 8_888,
        stockQuantity: 11,
        paymentGateway: status === "PendingPayment" ? "payOS" : "COD",
      });
      const before = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const response = await authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        createFixtureToken(customer.account),
      );
      const after = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const cancellationHistory = after.histories.filter(
        (history) => history.new_status === "Cancelled",
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        orderId: scenario.order.order_id,
        orderStatus: "Cancelled",
      });
      expect(after.order?.order_status).toBe("Cancelled");
      expect(after.variant?.stock_quantity).toBe(
        before.variant!.stock_quantity + 4,
      );
      expect(after.details).toEqual(before.details);
      expect(after.variant?.price).toBe(before.variant?.price);
      expect(cancellationHistory).toHaveLength(1);
      expect(cancellationHistory[0]).toMatchObject({
        old_status: status,
        new_status: "Cancelled",
        changed_by: customer.user.user_id,
      });
      expect(response.body.data.items[0]).toMatchObject({
        quantity: 4,
        unitPrice: 3_250,
        lineTotal: 13_000,
      });
    }
  });

  test("ORD-CAN-004 cancellation marks the still-pending payment as Cancelled atomically", async () => {
    const customer = await createOrderCustomer(prisma, "canpayment");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "canpaymentorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      paymentGateway: "COD",
      paymentStatus: "Pending",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await authorize(
      request(customerApp).patch(
        `/api/orders/${scenario.order.order_id}/cancel`,
      ),
      createFixtureToken(customer.account),
    );
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect({
      httpStatus: response.status,
      orderStatus: after.order?.order_status,
      paymentStatus: after.payments[0]?.status,
      stockQuantity: after.variant?.stock_quantity,
      shipmentCount: after.shipments.length,
    }).toEqual({
      httpStatus: 200,
      orderStatus: "Cancelled",
      paymentStatus: "Cancelled",
      stockQuantity:
        before.variant!.stock_quantity + scenario.expected.quantity,
      shipmentCount: 0,
    });
  });

  test("ORD-CAN-005 Confirmed, Processing, Shipping, Completed and Cancelled orders cannot be customer-cancelled", async () => {
    const forbiddenStatuses: OrderStatus[] = [
      "Confirmed",
      "Processing",
      "Shipping",
      "Completed",
      "Cancelled",
    ];

    for (const [index, status] of forbiddenStatuses.entries()) {
      const customer = await createOrderCustomer(
        prisma,
        `canforbiddencustomer${index}`,
      );
      const shipmentStatus =
        status === "Processing"
          ? "Preparing"
          : status === "Shipping"
            ? "Shipped"
            : status === "Completed"
              ? "Delivered"
              : status === "Confirmed"
                ? "Pending"
                : null;
      const scenario = await createOrderLifecycleScenario(prisma, {
        label: `canforbiddenorder${index}`,
        customerId: customer.user.user_id,
        status,
        stockQuantity: 17,
        shipmentStatus,
        paymentStatus: status === "Completed" ? "Success" : "Pending",
      });
      const before = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const response = await authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        createFixtureToken(customer.account),
      );
      const after = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false });
      expect(after).toEqual(before);
      expectSafeErrorBody(response.body);
    }
  });

  test("ORD-CAN-006 sequential duplicate cancellation restores stock and writes history only once", async () => {
    const customer = await createOrderCustomer(prisma, "cansequential");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "cansequentialorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      quantity: 3,
      stockQuantity: 9,
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(customer.account);
    const sendCancel = () =>
      authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        token,
      );
    const first = await sendCancel();
    const afterFirst = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const second = await sendCancel();
    const afterSecond = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect([first.status, second.status]).toEqual([200, 400]);
    expect(afterSecond.variant?.stock_quantity).toBe(
      before.variant!.stock_quantity + 3,
    );
    expect(
      afterSecond.histories.filter(
        (history) => history.new_status === "Cancelled",
      ),
    ).toHaveLength(1);
    expect(afterSecond).toEqual(afterFirst);
    expectSafeErrorBody(second.body);
  });

  test("ORD-CAN-007 concurrent duplicate cancellation has one winner and no double-restock", async () => {
    const customer = await createOrderCustomer(prisma, "canconcurrent");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "canconcurrentorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      quantity: 5,
      stockQuantity: 12,
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(customer.account);
    const sendCancel = () =>
      authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        token,
      );
    const responses = await Promise.all([sendCancel(), sendCancel()]);
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect({
      statuses: responses
        .map((response) => response.status)
        .sort((a, b) => a - b),
      orderStatus: after.order?.order_status,
      stockQuantity: after.variant?.stock_quantity,
      cancellationHistoryCount: after.histories.filter(
        (history) => history.new_status === "Cancelled",
      ).length,
    }).toEqual({
      statuses: [200, 400],
      orderStatus: "Cancelled",
      stockQuantity: before.variant!.stock_quantity + 5,
      cancellationHistoryCount: 1,
    });
    expect(after.details).toEqual(before.details);
  });

  test("ORD-CAN-008 history-write failure rolls back order, stock, payment, detail and shipment state", async () => {
    const customer = await createOrderCustomer(prisma, "canatomic");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "canatomicorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      quantity: 4,
      stockQuantity: 10,
      paymentStatus: "Pending",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const trigger = await installOrderHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
      "can_atomic",
    );
    let response;

    try {
      response = await authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        createFixtureToken(customer.account),
      );
    } finally {
      await removeOrderHistoryFailureTrigger(prisma, trigger);
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(response.status).toBe(500);
    expect(after).toEqual(before);
  });

  test("ORD-CAN-009 unexpected persistence errors return a sanitized public envelope", async () => {
    const customer = await createOrderCustomer(prisma, "canerrorsafe");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "canerrorsafeorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const trigger = await installOrderHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
      "can_error",
    );
    let response;

    try {
      response = await authorize(
        request(customerApp).patch(
          `/api/orders/${scenario.order.order_id}/cancel`,
        ),
        createFixtureToken(customer.account),
      );
    } finally {
      await removeOrderHistoryFailureTrigger(prisma, trigger);
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý đơn hàng thất bại",
    });
    expect(after).toEqual(before);
    expectSafeErrorBody(response.body);
  });
});
