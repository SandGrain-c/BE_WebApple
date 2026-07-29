import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createOrderActor,
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

describe.sequential("Admin order status integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("ORD-ADM-001 status update rejects missing and invalid tokens without mutation", async () => {
    const customer = await createOrderCustomer(prisma, "admauthcustomer");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admauthorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const path = `/api/admin/orders/${scenario.order.order_id}/status`;
    const responses = [
      await request(adminApp).patch(path).send({ status: "Confirmed" }),
      await authorize(
        request(adminApp).patch(path),
        "invalid-token",
      ).send({ status: "Confirmed" }),
    ];
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("ORD-ADM-002 Customer, WarehouseStaff and unknown roles are denied before mutation", async () => {
    const customer = await createOrderCustomer(prisma, "admrbaccustomer");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admrbacorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const path = `/api/admin/orders/${scenario.order.order_id}/status`;
    const accounts = [
      manifest.accounts.customer_active,
      manifest.accounts.warehouse_active,
      manifest.accounts.unknown_role_active,
    ];
    const responses = [];

    for (const account of accounts) {
      responses.push(
        await authorize(
          request(adminApp).patch(path),
          createFixtureToken(account),
        ).send({ status: "Confirmed" }),
      );
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403,
    ]);
    expect(after).toEqual(before);
  });

  test("ORD-ADM-003 locked Admin and locked Staff are rejected by refreshed authentication", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admlockedcustomer",
    );
    const lockedStaff = await createOrderActor(prisma, {
      label: "admlockedstaff",
      roleName: "Staff",
      status: 0,
    });
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admlockedorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const path = `/api/admin/orders/${scenario.order.order_id}/status`;
    const responses = [];

    for (const account of [
      manifest.accounts.admin_locked,
      lockedStaff.account,
    ]) {
      responses.push(
        await authorize(
          request(adminApp).patch(path),
          createFixtureToken(account),
        ).send({ status: "Confirmed" }),
      );
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expect(after).toEqual(before);
  });

  test("ORD-ADM-004 Admin and Staff can access order management and Staff is recorded as transition actor", async () => {
    const customer = await createOrderCustomer(prisma, "admstaffcustomer");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admstafforder",
      customerId: customer.user.user_id,
      status: "Confirmed",
    });
    const adminRead = await authorize(
      request(adminApp).get(
        `/api/admin/orders/${scenario.order.order_id}`,
      ),
      createFixtureToken(manifest.accounts.admin_active),
    );
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const staffUpdate = await authorize(
      request(adminApp).patch(
        `/api/admin/orders/${scenario.order.order_id}/status`,
      ),
      createFixtureToken(manifest.accounts.staff_active),
    ).send({ status: "Processing", note: "Staff accepted order" });
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const history = after.histories.at(-1);

    expect(adminRead.status).toBe(200);
    expect(staffUpdate.status).toBe(200);
    expect(after.order?.order_status).toBe("Processing");
    expect(history).toMatchObject({
      old_status: "Confirmed",
      new_status: "Processing",
      changed_by: manifest.accounts.staff_active.userId,
      note: "Staff accepted order",
    });
    expect(new Date(after.order!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.order!.updated_at).getTime(),
    );
  });

  test("ORD-ADM-005 missing, blank and invalid enum status values return 400 without mutation", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admvalidationcustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admvalidationorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const path = `/api/admin/orders/${scenario.order.order_id}/status`;
    const payloads = [{}, { status: "   " }, { status: "NotAStatus" }];
    const responses = [];

    for (const payload of payloads) {
      responses.push(
        await authorize(request(adminApp).patch(path), token).send(payload),
      );
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("ORD-ADM-006 numeric, boolean, array and object status runtime types return controlled 400", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admtypecustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admtypeorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const path = `/api/admin/orders/${scenario.order.order_id}/status`;
    const payloads: Array<Record<string, unknown>> = [
      { status: 3 },
      { status: true },
      { status: ["Confirmed"] },
      { status: { value: "Confirmed" } },
    ];
    const responses = [];

    for (const payload of payloads) {
      responses.push(
        await authorize(request(adminApp).patch(path), token).send(payload),
      );
    }

    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("ORD-ADM-007 unknown and mass-assignment fields cannot change financial, owner or payment state", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admmasscustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admmassorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      quantity: 2,
      unitPrice: 4_000,
      stockQuantity: 15,
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await authorize(
      request(adminApp).patch(
        `/api/admin/orders/${scenario.order.order_id}/status`,
      ),
      createFixtureToken(manifest.accounts.admin_active),
    ).send({
      status: "Confirmed",
      userId: manifest.accounts.customer_b.userId,
      subTotal: 1,
      totalAmount: 1,
      paymentStatus: "Success",
      stockQuantity: 999_999,
      unknownField: "ignored",
    });
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(response.status).toBe(200);
    expect(after.order).toMatchObject({
      user_id: before.order?.user_id,
      order_status: "Confirmed",
      sub_total: before.order?.sub_total,
      shipping_fee: before.order?.shipping_fee,
      discount_amount: before.order?.discount_amount,
      total_amount: before.order?.total_amount,
    });
    expect(after.payments).toEqual(before.payments);
    expect(after.variant).toEqual(before.variant);
    expect(after.details).toEqual(before.details);
    expect(after.shipments).toHaveLength(1);
  });

  test("ORD-ADM-008 every canonical state transition succeeds with one history and expected side effects", async () => {
    const transitions: Array<[OrderStatus, OrderStatus]> = [
      ["PendingPayment", "Cancelled"],
      ["PendingConfirmation", "Confirmed"],
      ["PendingConfirmation", "Cancelled"],
      ["Confirmed", "Processing"],
      ["Confirmed", "Cancelled"],
      ["Processing", "Shipping"],
      ["Processing", "Cancelled"],
      ["Shipping", "Completed"],
    ];

    for (const [index, [oldStatus, newStatus]] of transitions.entries()) {
      const customer = await createOrderCustomer(
        prisma,
        `admtransitioncustomer${index}`,
      );
      const scenario = await createOrderLifecycleScenario(prisma, {
        label: `admtransitionorder${index}`,
        customerId: customer.user.user_id,
        status: oldStatus,
        quantity: 2,
        stockQuantity: 13,
        shipmentStatus:
          oldStatus === "Shipping"
            ? "Shipped"
            : oldStatus === "Processing" || oldStatus === "Confirmed"
              ? "Pending"
              : null,
      });
      const before = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const response = await authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        createFixtureToken(manifest.accounts.admin_active),
      ).send({ status: newStatus });
      const after = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const transitionHistories = after.histories.filter(
        (history) =>
          history.old_status === oldStatus &&
          history.new_status === newStatus,
      );

      expect(response.status).toBe(200);
      expect(after.order?.order_status).toBe(newStatus);
      expect(transitionHistories).toHaveLength(1);
      expect(transitionHistories[0].changed_by).toBe(
        manifest.accounts.admin_active.userId,
      );
      expect(after.variant?.stock_quantity).toBe(
        newStatus === "Cancelled"
          ? before.variant!.stock_quantity + 2
          : before.variant!.stock_quantity,
      );
      expect(after.details).toEqual(before.details);
      if (newStatus === "Confirmed") {
        expect(after.shipments).toHaveLength(1);
        expect(after.shipments[0]).toMatchObject({
          order_id: scenario.order.order_id,
          status: "Pending",
        });
        expect(after.shipments[0].shipment_status_history).toHaveLength(1);
      }
    }
  });

  test("ORD-ADM-009 confirmation creates at most one shipment when one already exists", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admshipmentcustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admshipmentorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      shipmentStatus: "Pending",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await authorize(
      request(adminApp).patch(
        `/api/admin/orders/${scenario.order.order_id}/status`,
      ),
      createFixtureToken(manifest.accounts.admin_active),
    ).send({ status: "Confirmed" });
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(response.status).toBe(200);
    expect(after.shipments).toEqual(before.shipments);
    expect(after.shipments).toHaveLength(1);
  });

  test("ORD-ADM-010 skip, reverse, same-state and terminal transitions are rejected without side effects", async () => {
    const invalidTransitions: Array<[OrderStatus, OrderStatus]> = [
      ["PendingPayment", "Confirmed"],
      ["PendingConfirmation", "Processing"],
      ["Processing", "Confirmed"],
      ["Confirmed", "Confirmed"],
      ["Completed", "Cancelled"],
      ["Cancelled", "PendingConfirmation"],
    ];

    for (const [index, [oldStatus, newStatus]] of invalidTransitions.entries()) {
      const customer = await createOrderCustomer(
        prisma,
        `adminvalidcustomer${index}`,
      );
      const scenario = await createOrderLifecycleScenario(prisma, {
        label: `adminvalidorder${index}`,
        customerId: customer.user.user_id,
        status: oldStatus,
        stockQuantity: 16,
        shipmentStatus:
          oldStatus === "Processing"
            ? "Preparing"
            : oldStatus === "Completed"
              ? "Delivered"
              : oldStatus === "Confirmed"
                ? "Pending"
                : null,
        paymentStatus: oldStatus === "Completed" ? "Success" : "Pending",
      });
      const before = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );
      const response = await authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        createFixtureToken(manifest.accounts.admin_active),
      ).send({ status: newStatus });
      const after = await snapshotOrderLifecycle(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      );

      expect(response.status).toBe(400);
      expect(after).toEqual(before);
      expectSafeErrorBody(response.body);
    }
  });

  test("ORD-ADM-011 Admin cancellation restores stock only once across sequential retries", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admsequentialcustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admsequentialorder",
      customerId: customer.user.user_id,
      status: "Processing",
      quantity: 3,
      stockQuantity: 8,
      shipmentStatus: "Preparing",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const sendCancel = () =>
      authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        token,
      ).send({ status: "Cancelled" });
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
  });

  test("ORD-ADM-012 concurrent cancellation has one winner, one history and one stock restoration", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admconcancelcustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admconcancelorder",
      customerId: customer.user.user_id,
      status: "Processing",
      quantity: 4,
      stockQuantity: 7,
      shipmentStatus: "Preparing",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const sendCancel = () =>
      authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        token,
      ).send({ status: "Cancelled" });
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
      stockQuantity: before.variant!.stock_quantity + 4,
      cancellationHistoryCount: 1,
    });
  });

  test("ORD-ADM-013 concurrent divergent updates produce one legal winner and coherent side effects", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admdivergecustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admdivergeorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      quantity: 2,
      stockQuantity: 9,
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const update = (status: "Confirmed" | "Cancelled") =>
      authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        token,
      ).send({ status });
    const responses = await Promise.all([
      update("Confirmed"),
      update("Cancelled"),
    ]);
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const transitionHistories = after.histories.filter(
      (history) => history.old_status === "PendingConfirmation",
    );
    const successCount = responses.filter(
      (response) => response.status === 200,
    ).length;

    const expectedSideEffects =
      after.order?.order_status === "Confirmed"
        ? {
            shipmentCount: 1,
            stockQuantity: before.variant?.stock_quantity,
          }
        : {
            shipmentCount: 0,
            stockQuantity: before.variant!.stock_quantity + 2,
          };

    expect({
      successCount,
      finalStatus: after.order?.order_status,
      transitionHistoryCount: transitionHistories.length,
      shipmentCount: after.shipments.length,
      stockQuantity: after.variant?.stock_quantity,
    }).toEqual({
      successCount: 1,
      finalStatus: expect.stringMatching(/^(Confirmed|Cancelled)$/),
      transitionHistoryCount: 1,
      ...expectedSideEffects,
    });
  });

  test("ORD-ADM-014 history-write failure rolls back status, stock, payment, shipment and history", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admatomiccustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admatomicorder",
      customerId: customer.user.user_id,
      status: "Processing",
      quantity: 4,
      stockQuantity: 10,
      shipmentStatus: "Preparing",
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
      "adm_atomic",
    );
    let response;

    try {
      response = await authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        createFixtureToken(manifest.accounts.admin_active),
      ).send({ status: "Cancelled" });
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

  test("ORD-ADM-015 unexpected persistence errors return a sanitized public envelope", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admerrorcustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admerrororder",
      customerId: customer.user.user_id,
      status: "Confirmed",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const trigger = await installOrderHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
      "adm_error",
    );
    let response;

    try {
      response = await authorize(
        request(adminApp).patch(
          `/api/admin/orders/${scenario.order.order_id}/status`,
        ),
        createFixtureToken(manifest.accounts.admin_active),
      ).send({ status: "Processing" });
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

  test("ORD-ADM-016 cancellation synchronizes pending payment and active shipment to Cancelled", async () => {
    const customer = await createOrderCustomer(
      prisma,
      "admcancelsynccustomer",
    );
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "admcancelsyncorder",
      customerId: customer.user.user_id,
      status: "Processing",
      quantity: 2,
      stockQuantity: 14,
      shipmentStatus: "Preparing",
      paymentGateway: "COD",
      paymentStatus: "Pending",
    });
    const before = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await authorize(
      request(adminApp).patch(
        `/api/admin/orders/${scenario.order.order_id}/status`,
      ),
      createFixtureToken(manifest.accounts.admin_active),
    ).send({ status: "Cancelled" });
    const after = await snapshotOrderLifecycle(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect({
      httpStatus: response.status,
      orderStatus: after.order?.order_status,
      paymentStatus: after.payments[0]?.status,
      shipmentStatus: after.shipments[0]?.status,
      stockQuantity: after.variant?.stock_quantity,
      cancellationHistoryCount: after.histories.filter(
        (history) => history.new_status === "Cancelled",
      ).length,
    }).toEqual({
      httpStatus: 200,
      orderStatus: "Cancelled",
      paymentStatus: "Cancelled",
      shipmentStatus: "Cancelled",
      stockQuantity:
        before.variant!.stock_quantity + scenario.expected.quantity,
      cancellationHistoryCount: 1,
    });
  });
});
