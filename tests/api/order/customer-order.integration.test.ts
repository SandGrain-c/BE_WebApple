import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createOrderCustomer,
  createOrderLifecycleScenario,
} from "../../factories/order-lifecycle.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeResponse(body: unknown) {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /pass_hash|JWT_SECRET|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE |\/Users\//i,
  );
}

async function customerOrderState(userId: number) {
  const [orders, details, histories, payments, shipments] = await Promise.all([
    prisma.orders.count({ where: { user_id: userId } }),
    prisma.order_details.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.order_status_history.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.payment_transactions.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.shipments.count({
      where: { orders: { is: { user_id: userId } } },
    }),
  ]);

  return { orders, details, histories, payments, shipments };
}

describe.sequential("Customer order list and detail integration", () => {
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

  test("ORD-CUS-001 list rejects missing, invalid and locked-customer tokens", async () => {
    const lockedBefore = await customerOrderState(
      manifest.accounts.customer_locked.userId,
    );
    const responses = [
      await request(customerApp).get("/api/orders"),
      await authorize(
        request(customerApp).get("/api/orders"),
        "invalid-token",
      ),
      await authorize(
        request(customerApp).get("/api/orders"),
        createFixtureToken(manifest.accounts.customer_locked),
      ),
    ];
    const lockedAfter = await customerOrderState(
      manifest.accounts.customer_locked.userId,
    );

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401,
    ]);
    expect(lockedAfter).toEqual(lockedBefore);
    for (const response of responses) {
      expect(response.body).toMatchObject({ success: false });
      expectSafeResponse(response.body);
    }
  });

  test("ORD-CUS-002 list is isolated to the authenticated customer", async () => {
    const customerA = await createOrderCustomer(prisma, "cuslistownera");
    const customerB = await createOrderCustomer(prisma, "cuslistownerb");
    const orderA = await createOrderLifecycleScenario(prisma, {
      label: "cuslistordera",
      customerId: customerA.user.user_id,
      status: "PendingConfirmation",
    });
    const orderB = await createOrderLifecycleScenario(prisma, {
      label: "cuslistorderb",
      customerId: customerB.user.user_id,
      status: "Completed",
    });
    const customerBBefore = await customerOrderState(customerB.user.user_id);
    const response = await authorize(
      request(customerApp).get("/api/orders"),
      createFixtureToken(customerA.account),
    );
    const customerBAfter = await customerOrderState(customerB.user.user_id);
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].orderId).toBe(orderA.order.order_id);
    expect(serialized).not.toContain(orderB.order.order_code);
    expect(serialized).not.toContain(orderB.order.customer_phone);
    expect(customerBAfter).toEqual(customerBBefore);
  });

  test("ORD-CUS-003 pagination is applied server-side with canonical metadata", async () => {
    const customer = await createOrderCustomer(prisma, "cuspagination");
    const first = await createOrderLifecycleScenario(prisma, {
      label: "cuspagefirst",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const second = await createOrderLifecycleScenario(prisma, {
      label: "cuspagemiddle",
      customerId: customer.user.user_id,
      status: "Confirmed",
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
    });
    const third = await createOrderLifecycleScenario(prisma, {
      label: "cuspagenewest",
      customerId: customer.user.user_id,
      status: "Completed",
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
    });
    const before = await customerOrderState(customer.user.user_id);
    const response = await authorize(
      request(customerApp).get(
        "/api/orders?page=2&limit=1&sort=newest",
      ),
      createFixtureToken(customer.account),
    );
    const after = await customerOrderState(customer.user.user_id);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [
        expect.objectContaining({
          orderId: second.order.order_id,
        }),
      ],
      pagination: {
        page: 2,
        limit: 1,
        totalItems: 3,
        totalPages: 3,
      },
    });
    expect(
      [first.order.order_id, second.order.order_id, third.order.order_id],
    ).toContain(response.body.data.items[0].orderId);
    expect(after).toEqual(before);
  });

  test("ORD-CUS-004 malformed page and limit query values return controlled 400", async () => {
    const customer = await createOrderCustomer(prisma, "cusbadpage");
    await createOrderLifecycleScenario(prisma, {
      label: "cusbadpageorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await customerOrderState(customer.user.user_id);
    const token = createFixtureToken(customer.account);
    const responses = [
      await authorize(
        request(customerApp).get("/api/orders?page=text"),
        token,
      ),
      await authorize(
        request(customerApp).get("/api/orders?page=1.5"),
        token,
      ),
      await authorize(
        request(customerApp).get("/api/orders?limit=text"),
        token,
      ),
      await authorize(
        request(customerApp).get("/api/orders?limit=0"),
        token,
      ),
    ];
    const after = await customerOrderState(customer.user.user_id);

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeResponse(response.body));
  });

  test("ORD-CUS-005 valid status filter returns only matching owned orders", async () => {
    const customer = await createOrderCustomer(prisma, "cusstatusfilter");
    const matching = await createOrderLifecycleScenario(prisma, {
      label: "cusstatuscompleted",
      customerId: customer.user.user_id,
      status: "Completed",
    });
    await createOrderLifecycleScenario(prisma, {
      label: "cusstatuspending",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await customerOrderState(customer.user.user_id);
    const response = await authorize(
      request(customerApp).get("/api/orders?status=Completed"),
      createFixtureToken(customer.account),
    );
    const after = await customerOrderState(customer.user.user_id);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        orderId: matching.order.order_id,
        orderStatus: "Completed",
      }),
    ]);
    expect(after).toEqual(before);
  });

  test("ORD-CUS-006 invalid status and sort query values return controlled 400", async () => {
    const customer = await createOrderCustomer(prisma, "cusinvalidquery");
    await createOrderLifecycleScenario(prisma, {
      label: "cusinvalidqueryorder",
      customerId: customer.user.user_id,
      status: "Confirmed",
    });
    const before = await customerOrderState(customer.user.user_id);
    const token = createFixtureToken(customer.account);
    const responses = [
      await authorize(
        request(customerApp).get("/api/orders?status=NotAStatus"),
        token,
      ),
      await authorize(
        request(customerApp).get("/api/orders?sort=random"),
        token,
      ),
    ];
    const after = await customerOrderState(customer.user.user_id);

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    expect(after).toEqual(before);
    responses.forEach((response) => expectSafeResponse(response.body));
  });

  test("ORD-CUS-007 oldest and total ascending sorts use deterministic server ordering", async () => {
    const customer = await createOrderCustomer(prisma, "cussorting");
    const oldest = await createOrderLifecycleScenario(prisma, {
      label: "cussortoldest",
      customerId: customer.user.user_id,
      status: "Confirmed",
      quantity: 1,
      unitPrice: 9_000,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const cheapest = await createOrderLifecycleScenario(prisma, {
      label: "cussortcheapest",
      customerId: customer.user.user_id,
      status: "Confirmed",
      quantity: 1,
      unitPrice: 1_000,
      createdAt: new Date("2026-06-03T00:00:00.000Z"),
    });
    const middle = await createOrderLifecycleScenario(prisma, {
      label: "cussortmiddle",
      customerId: customer.user.user_id,
      status: "Confirmed",
      quantity: 1,
      unitPrice: 5_000,
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
    });
    const before = await customerOrderState(customer.user.user_id);
    const token = createFixtureToken(customer.account);
    const [oldestResponse, totalResponse] = await Promise.all([
      authorize(
        request(customerApp).get("/api/orders?sort=oldest"),
        token,
      ),
      authorize(
        request(customerApp).get("/api/orders?sort=total_asc"),
        token,
      ),
    ]);
    const after = await customerOrderState(customer.user.user_id);

    expect(oldestResponse.status).toBe(200);
    expect(
      oldestResponse.body.data.items.map(
        (item: { orderId: number }) => item.orderId,
      ),
    ).toEqual([
      oldest.order.order_id,
      middle.order.order_id,
      cheapest.order.order_id,
    ]);
    expect(
      totalResponse.body.data.items.map(
        (item: { orderId: number }) => item.orderId,
      ),
    ).toEqual([
      cheapest.order.order_id,
      middle.order.order_id,
      oldest.order.order_id,
    ]);
    expect(after).toEqual(before);
  });

  test("ORD-CUS-008 unknown query fields are ignored without mutation or 500", async () => {
    const customer = await createOrderCustomer(prisma, "cusunknownquery");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "cusunknownqueryorder",
      customerId: customer.user.user_id,
      status: "PendingConfirmation",
    });
    const before = await customerOrderState(customer.user.user_id);
    const response = await authorize(
      request(customerApp).get(
        "/api/orders?unknownField=ignored&userId=999999",
      ),
      createFixtureToken(customer.account),
    );
    const after = await customerOrderState(customer.user.user_id);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ orderId: scenario.order.order_id }),
    ]);
    expect(after).toEqual(before);
  });

  test("ORD-CUS-009 owned detail returns authoritative item data and price snapshot", async () => {
    const customer = await createOrderCustomer(prisma, "cusdetail");
    const scenario = await createOrderLifecycleScenario(prisma, {
      label: "cusdetailorder",
      customerId: customer.user.user_id,
      status: "Processing",
      quantity: 3,
      unitPrice: 2_500,
      currentPrice: 9_999,
      shipmentStatus: "Preparing",
    });
    const before = await customerOrderState(customer.user.user_id);
    const response = await authorize(
      request(customerApp).get(
        `/api/orders/${scenario.order.order_id}`,
      ),
      createFixtureToken(customer.account),
    );
    const after = await customerOrderState(customer.user.user_id);
    const item = response.body.data.items[0];

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      orderId: scenario.order.order_id,
      orderCode: scenario.order.order_code,
      orderStatus: "Processing",
      subTotal: 7_500,
      totalAmount: 7_500,
    });
    expect(item).toEqual({
      orderDetailId: scenario.detail.order_detail_id,
      variantId: scenario.variant.variant_id,
      productId: scenario.product.product_id,
      productName: scenario.product.name,
      productSlug: scenario.product.slug,
      sku: scenario.variant.sku,
      color: scenario.variant.color,
      capacity: scenario.variant.capacity,
      ram: scenario.variant.ram,
      quantity: 3,
      unitPrice: 2_500,
      lineTotal: 7_500,
    });
    expect(Object.keys(response.body.data).sort()).toEqual(
      [
        "createdAt",
        "customerName",
        "customerPhone",
        "discountAmount",
        "items",
        "orderCode",
        "orderId",
        "orderStatus",
        "shippingAddress",
        "shippingFee",
        "subTotal",
        "totalAmount",
        "updatedAt",
      ].sort(),
    );
    expectSafeResponse(response.body);
    expect(after).toEqual(before);
  });

  test("ORD-CUS-010 nonexistent and cross-customer detail IDs are hidden with 404", async () => {
    const customerA = await createOrderCustomer(prisma, "cusdetailidora");
    const customerB = await createOrderCustomer(prisma, "cusdetailidorb");
    const privateOrder = await createOrderLifecycleScenario(prisma, {
      label: "cusdetailprivate",
      customerId: customerB.user.user_id,
      status: "Completed",
    });
    const privateBefore = await customerOrderState(customerB.user.user_id);
    const token = createFixtureToken(customerA.account);
    const responses = [
      await authorize(
        request(customerApp).get(
          `/api/orders/${privateOrder.order.order_id}`,
        ),
        token,
      ),
      await authorize(
        request(customerApp).get("/api/orders/2147483647"),
        token,
      ),
    ];
    const privateAfter = await customerOrderState(customerB.user.user_id);
    const serialized = JSON.stringify(responses.map((item) => item.body));

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(serialized).not.toContain(privateOrder.order.order_code);
    expect(serialized).not.toContain(privateOrder.order.customer_phone);
    expect(privateAfter).toEqual(privateBefore);
    responses.forEach((response) => expectSafeResponse(response.body));
  });
});
