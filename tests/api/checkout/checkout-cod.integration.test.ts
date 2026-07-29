import type { Express } from "express";
import request, { type Test } from "supertest";
import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createCheckoutScenario,
  createVoucherFixture,
} from "../../factories/checkout-cod.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeErrorBody(body: unknown) {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /pass_hash|JWT_SECRET|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE |\/Users\//i,
  );
}

async function mutationSnapshot(
  userId: number,
  variantIds: number[],
  voucherId?: number,
) {
  const [
    orders,
    details,
    payments,
    histories,
    usages,
    shipments,
    variants,
    cartItems,
    voucher,
  ] = await Promise.all([
    prisma.orders.count({ where: { user_id: userId } }),
    prisma.order_details.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.payment_transactions.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.order_status_history.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.voucher_usages.count({ where: { user_id: userId } }),
    prisma.shipments.count({
      where: { orders: { is: { user_id: userId } } },
    }),
    prisma.product_variants.findMany({
      where: { variant_id: { in: variantIds } },
      orderBy: { variant_id: "asc" },
      select: { variant_id: true, price: true, stock_quantity: true },
    }),
    prisma.cart_items.findMany({
      where: { carts: { is: { user_id: userId } } },
      orderBy: { cart_item_id: "asc" },
      select: {
        cart_item_id: true,
        variant_id: true,
        quantity: true,
        selected: true,
      },
    }),
    voucherId
      ? prisma.vouchers.findUnique({
          where: { voucher_id: voucherId },
          select: { voucher_id: true, used_count: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    orders,
    details,
    payments,
    histories,
    usages,
    shipments,
    variants: variants.map((variant) => ({
      ...variant,
      price: Number(variant.price),
    })),
    cartItems,
    voucher,
  };
}

async function installPaymentFailureTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_cod_payment_insert()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.gateway = 'COD' THEN
        RAISE EXCEPTION 'controlled checkout payment failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_cod_payment_trigger
    BEFORE INSERT ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION test_fail_cod_payment_insert()
  `);
}

async function removePaymentFailureTrigger() {
  await prisma.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS test_fail_cod_payment_trigger ON payment_transactions",
  );
  await prisma.$executeRawUnsafe(
    "DROP FUNCTION IF EXISTS test_fail_cod_payment_insert()",
  );
}

describe.sequential("Checkout COD integration", () => {
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

  afterAll(async () => {
    await prisma.products.updateMany({
      where: { slug: { startsWith: "checkout-product-" } },
      data: { is_active: false },
    });
  });

  test("COD-API-001 authentication rejects missing and invalid tokens", async () => {
    const responses = [
      await request(customerApp).post("/api/orders/checkout").send({}),
      await authorize(
        request(customerApp).post("/api/orders/checkout"),
        "invalid-token",
      ).send({}),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    for (const response of responses) {
      expect(response.body).toMatchObject({ success: false });
      expectSafeErrorBody(response.body);
    }
  });

  test("COD-API-002 locked customer token is rejected by refreshed authentication", async () => {
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(manifest.accounts.customer_locked),
    ).send({ addressId: manifest.ownership.address_a.addressId });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false });
  });

  test("COD-API-003 addressId requires a number without string coercion", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codaddrtype",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const before = await mutationSnapshot(
      scenario.user.user_id,
      scenario.items.map((item) => item.variant.variant_id),
    );
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({
      addressId: String(scenario.address.address_id),
      paymentMethod: "COD",
    });
    const after = await mutationSnapshot(
      scenario.user.user_id,
      scenario.items.map((item) => item.variant.variant_id),
    );

    expect({ status: response.status, state: after }).toEqual({
      status: 400,
      state: before,
    });
  });

  test("COD-API-004 missing and nonexistent addresses are rejected without mutation", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codaddrmissing",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const token = createFixtureToken(scenario.account);
    const variantIds = scenario.items.map((item) => item.variant.variant_id);
    const before = await mutationSnapshot(scenario.user.user_id, variantIds);
    const responses = [
      await authorize(
        request(customerApp).post("/api/orders/checkout"),
        token,
      ).send({ paymentMethod: "COD" }),
      await authorize(
        request(customerApp).post("/api/orders/checkout"),
        token,
      ).send({ addressId: 2_147_483_647, paymentMethod: "COD" }),
    ];

    expect(responses.map((response) => response.status)).toEqual([400, 404]);
    expect(
      await mutationSnapshot(scenario.user.user_id, variantIds),
    ).toEqual(before);
  });

  test("COD-API-005 cross-customer address is hidden as not found and Customer B is unchanged", async () => {
    const customerA = await createCheckoutScenario(prisma, {
      label: "codidora",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const customerB = await createCheckoutScenario(prisma, {
      label: "codidorb",
      items: [],
    });
    const variantIds = customerA.items.map(
      (item) => item.variant.variant_id,
    );
    const before = await mutationSnapshot(customerA.user.user_id, variantIds);
    const customerBAddressBefore = await prisma.user_addresses.findUnique({
      where: { address_id: customerB.address.address_id },
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(customerA.account),
    ).send({
      addressId: customerB.address.address_id,
      paymentMethod: "COD",
    });

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(
      customerB.address.receiver_phone,
    );
    expect(await mutationSnapshot(customerA.user.user_id, variantIds)).toEqual(
      before,
    );
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: customerB.address.address_id },
      }),
    ).toEqual(customerBAddressBefore);
  });

  test("COD-API-006 empty and selected-empty carts are rejected without deleting unselected items", async () => {
    const empty = await createCheckoutScenario(prisma, {
      label: "codempty",
      items: [],
    });
    const unselected = await createCheckoutScenario(prisma, {
      label: "codunselected",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 1,
          selected: false,
        },
      ],
    });
    const emptyResponse = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(empty.account),
    ).send({ addressId: empty.address.address_id, paymentMethod: "COD" });
    const unselectedBefore = await mutationSnapshot(
      unselected.user.user_id,
      unselected.items.map((item) => item.variant.variant_id),
    );
    const unselectedResponse = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(unselected.account),
    ).send({
      addressId: unselected.address.address_id,
      paymentMethod: "COD",
    });

    expect([emptyResponse.status, unselectedResponse.status]).toEqual([
      400, 400,
    ]);
    expect(
      await mutationSnapshot(
        unselected.user.user_id,
        unselected.items.map((item) => item.variant.variant_id),
      ),
    ).toEqual(unselectedBefore);
  });

  test("COD-API-007 happy path creates authoritative COD records for selected items only", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codhappy",
      items: [
        {
          key: "first",
          price: 1_000,
          stockQuantity: 10,
          quantity: 2,
          selected: true,
        },
        {
          key: "second",
          price: 2_500,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
        {
          key: "keep",
          price: 9_000,
          stockQuantity: 3,
          quantity: 1,
          selected: false,
        },
      ],
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({
      addressId: scenario.address.address_id,
      paymentMethod: "COD",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        order: {
          orderStatus: "PendingConfirmation",
          customerName: scenario.address.receiver_name,
          customerPhone: scenario.address.receiver_phone,
          shippingAddress: [
            scenario.address.detailed_address,
            scenario.address.ward,
            scenario.address.city,
          ].join(", "),
          subTotal: 4_500,
          shippingFee: 0,
          discountAmount: 0,
          totalAmount: 4_500,
        },
        payment: null,
      },
    });
    expect(response.body.data.order.items).toHaveLength(2);

    const orderId = response.body.data.order.orderId;
    const stored = await prisma.orders.findUnique({
      where: { order_id: orderId },
      include: {
        order_details: { orderBy: { order_detail_id: "asc" } },
        payment_transactions: true,
        order_status_history: true,
        voucher_usages: true,
        shipments: true,
      },
    });
    expect(stored).toMatchObject({
      user_id: scenario.user.user_id,
      address_id: scenario.address.address_id,
      voucher_id: null,
      order_status: "PendingConfirmation",
      customer_name: scenario.address.receiver_name,
      customer_phone: scenario.address.receiver_phone,
    });
    expect(Number(stored?.sub_total)).toBe(4_500);
    expect(Number(stored?.shipping_fee)).toBe(0);
    expect(Number(stored?.discount_amount)).toBe(0);
    expect(Number(stored?.total_amount)).toBe(4_500);
    expect(stored?.order_details).toEqual([
      expect.objectContaining({
        variant_id: scenario.items[0].variant.variant_id,
        quantity: 2,
        unit_price: expect.anything(),
      }),
      expect.objectContaining({
        variant_id: scenario.items[1].variant.variant_id,
        quantity: 1,
        unit_price: expect.anything(),
      }),
    ]);
    expect(stored?.order_details.map((item) => Number(item.unit_price))).toEqual([
      1_000, 2_500,
    ]);
    expect(stored?.payment_transactions).toHaveLength(1);
    expect(stored?.payment_transactions[0]).toMatchObject({
      gateway: "COD",
      payment_type: "Payment",
      status: "Pending",
      transaction_ref: null,
      paid_at: null,
    });
    expect(Number(stored?.payment_transactions[0].amount)).toBe(4_500);
    expect(stored?.order_status_history).toEqual([
      expect.objectContaining({
        old_status: null,
        new_status: "PendingConfirmation",
        changed_by: scenario.user.user_id,
      }),
    ]);
    expect(stored?.voucher_usages).toBeNull();
    expect(stored?.shipments).toHaveLength(0);

    const variants = await prisma.product_variants.findMany({
      where: {
        variant_id: {
          in: scenario.items.map((item) => item.variant.variant_id),
        },
      },
      orderBy: { variant_id: "asc" },
    });
    expect(
      variants.map((variant) => ({
        variantId: variant.variant_id,
        stock: variant.stock_quantity,
      })),
    ).toEqual([
      {
        variantId: scenario.items[0].variant.variant_id,
        stock: 8,
      },
      {
        variantId: scenario.items[1].variant.variant_id,
        stock: 4,
      },
      {
        variantId: scenario.items[2].variant.variant_id,
        stock: 3,
      },
    ]);
    const remainingCartItems = await prisma.cart_items.findMany({
      where: { cart_id: scenario.cart!.cart_id },
    });
    expect(remainingCartItems).toEqual([
      expect.objectContaining({
        variant_id: scenario.items[2].variant.variant_id,
        quantity: 1,
        selected: false,
      }),
    ]);
  });

  test("COD-API-008 current database price overrides client totals and stale cart assumptions", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codprice",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 2,
          selected: true,
        },
      ],
    });
    await prisma.product_variants.update({
      where: { variant_id: scenario.items[0].variant.variant_id },
      data: { price: 1_300 },
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({
      addressId: scenario.address.address_id,
      paymentMethod: "COD",
      userId: manifest.accounts.customer_b.userId,
      customerId: manifest.accounts.customer_b.userId,
      orderStatus: "Completed",
      paymentStatus: "Success",
      paidAt: "2020-01-01T00:00:00.000Z",
      deliveredAt: "2020-01-01T00:00:00.000Z",
      staffId: 1,
      warehouseId: 1,
      internalNotes: "client controlled",
      price: 1,
      productPrice: 1,
      subTotal: 1,
      discountAmount: 999_999,
      totalAmount: 1,
      createdAt: "2020-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(201);
    const order = await prisma.orders.findUnique({
      where: { order_id: response.body.data.order.orderId },
      include: {
        order_details: true,
        payment_transactions: true,
      },
    });
    expect(order).toMatchObject({
      user_id: scenario.user.user_id,
      order_status: "PendingConfirmation",
    });
    expect(Number(order?.sub_total)).toBe(2_600);
    expect(Number(order?.discount_amount)).toBe(0);
    expect(Number(order?.total_amount)).toBe(2_600);
    expect(Number(order?.order_details[0].unit_price)).toBe(1_300);
    expect(order?.payment_transactions[0]).toMatchObject({
      gateway: "COD",
      status: "Pending",
      paid_at: null,
    });
  });

  test("COD-API-009 inactive product causes full rollback", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codinactive",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
          productActive: false,
        },
      ],
    });
    const variantIds = scenario.items.map((item) => item.variant.variant_id);
    const before = await mutationSnapshot(scenario.user.user_id, variantIds);
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({ addressId: scenario.address.address_id, paymentMethod: "COD" });

    expect(response.status).toBe(400);
    expect(await mutationSnapshot(scenario.user.user_id, variantIds)).toEqual(
      before,
    );
  });

  test("COD-API-010 quantity greater than stock rolls back all state", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codstocklow",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 1,
          quantity: 2,
          selected: true,
        },
      ],
    });
    const variantIds = scenario.items.map((item) => item.variant.variant_id);
    const before = await mutationSnapshot(scenario.user.user_id, variantIds);
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({ addressId: scenario.address.address_id, paymentMethod: "COD" });

    expect(response.status).toBe(400);
    expect(await mutationSnapshot(scenario.user.user_id, variantIds)).toEqual(
      before,
    );
  });

  test("COD-API-011 quantity equal to stock succeeds without negative stock", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codstockequal",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 2,
          quantity: 2,
          selected: true,
        },
      ],
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({ addressId: scenario.address.address_id, paymentMethod: "COD" });
    const variant = await prisma.product_variants.findUnique({
      where: { variant_id: scenario.items[0].variant.variant_id },
    });

    expect(response.status).toBe(201);
    expect(variant?.stock_quantity).toBe(0);
  });

  test("COD-API-012 zero stock rejects checkout and leaves cart intact", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codstockzero",
      items: [
        {
          key: "item",
          price: 1_000,
          stockQuantity: 0,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const variantIds = scenario.items.map((item) => item.variant.variant_id);
    const before = await mutationSnapshot(scenario.user.user_id, variantIds);
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({ addressId: scenario.address.address_id, paymentMethod: "COD" });

    expect(response.status).toBe(400);
    expect(await mutationSnapshot(scenario.user.user_id, variantIds)).toEqual(
      before,
    );
  });

  test("COD-API-013 invalid persisted zero and negative quantities create no order", async () => {
    const results = [];

    for (const [index, quantity] of [0, -1].entries()) {
      const scenario = await createCheckoutScenario(prisma, {
        label: `codbadqty${index}`,
        items: [
          {
            key: "item",
            price: 1_000,
            stockQuantity: 5,
            quantity,
            selected: true,
          },
        ],
      });
      const variantIds = scenario.items.map(
        (item) => item.variant.variant_id,
      );
      const before = await mutationSnapshot(scenario.user.user_id, variantIds);
      const response = await authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(scenario.account),
      ).send({
        addressId: scenario.address.address_id,
        paymentMethod: "COD",
      });
      const after = await mutationSnapshot(
        scenario.user.user_id,
        variantIds,
      );

      results.push({ status: response.status, unchanged: after });
      expect(after).toEqual(before);
    }

    expect(results.map((result) => result.status)).toEqual([400, 400]);
  });

  test("COD-API-014 valid normalized voucher creates one usage and correct discount", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codvoucher",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 2,
          selected: true,
        },
      ],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "codvoucher",
      discountType: "Percent",
      discountValue: 25,
      minOrderValue: 1_000,
      maxDiscountAmount: 800,
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({
      addressId: scenario.address.address_id,
      voucherCode: `  ${voucher.code.toLowerCase()}  `,
      paymentMethod: "COD",
    });
    const order = await prisma.orders.findUnique({
      where: { order_id: response.body.data.order.orderId },
      include: { voucher_usages: true },
    });
    const storedVoucher = await prisma.vouchers.findUnique({
      where: { voucher_id: voucher.voucher_id },
    });

    expect(response.status).toBe(201);
    expect(Number(order?.sub_total)).toBe(4_000);
    expect(Number(order?.discount_amount)).toBe(800);
    expect(Number(order?.total_amount)).toBe(3_200);
    expect(order?.voucher_id).toBe(voucher.voucher_id);
    expect(order?.voucher_usages).toMatchObject({
      voucher_id: voucher.voucher_id,
      user_id: scenario.user.user_id,
      order_id: order?.order_id,
    });
    expect(storedVoucher?.used_count).toBe(1);
    expect(
      await prisma.voucher_usages.count({
        where: {
          voucher_id: voucher.voucher_id,
          user_id: scenario.user.user_id,
        },
      }),
    ).toBe(1);
  });

  test("COD-API-015 invalid, expired, exhausted and below-min vouchers do not mutate checkout", async () => {
    const cases = [
      {
        label: "missing",
        createVoucher: false,
        code: "COD-NOT-FOUND",
      },
      {
        label: "expired",
        voucher: {
          startDate: new Date("2020-01-01T00:00:00.000Z"),
          endDate: new Date("2020-12-31T00:00:00.000Z"),
        },
      },
      {
        label: "exhausted",
        voucher: { usageLimit: 1, usedCount: 1 },
      },
      {
        label: "minimum",
        voucher: { minOrderValue: 2_000 },
      },
    ];
    const statuses = [];

    for (const testCase of cases) {
      const scenario = await createCheckoutScenario(prisma, {
        label: `codvou${testCase.label}`,
        items: [
          {
            key: "item",
            price: 1_000,
            stockQuantity: 5,
            quantity: 1,
            selected: true,
          },
        ],
      });
      const voucher =
        testCase.createVoucher === false
          ? null
          : await createVoucherFixture(prisma, {
              label: `codvou${testCase.label}`,
              ...testCase.voucher,
            });
      const variantIds = scenario.items.map(
        (item) => item.variant.variant_id,
      );
      const before = await mutationSnapshot(
        scenario.user.user_id,
        variantIds,
        voucher?.voucher_id,
      );
      const response = await authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(scenario.account),
      ).send({
        addressId: scenario.address.address_id,
        voucherCode: testCase.code ?? voucher?.code,
        paymentMethod: "COD",
      });

      statuses.push(response.status);
      expect(
        await mutationSnapshot(
          scenario.user.user_id,
          variantIds,
          voucher?.voucher_id,
        ),
      ).toEqual(before);
    }

    expect(statuses).toEqual([404, 400, 400, 400]);
  });

  test("COD-API-016 client shippingFee cannot change canonical free shipping", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codshipping",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(scenario.account),
    ).send({
      addressId: scenario.address.address_id,
      paymentMethod: "COD",
      shippingFee: 999_999,
    });
    const order = await prisma.orders.findUnique({
      where: { order_id: response.body.data.order.orderId },
      include: { payment_transactions: true },
    });

    expect({
      status: response.status,
      responseShippingFee: response.body.data.order.shippingFee,
      responseTotal: response.body.data.order.totalAmount,
      storedShippingFee: Number(order?.shipping_fee),
      storedTotal: Number(order?.total_amount),
      paymentAmount: Number(order?.payment_transactions[0].amount),
    }).toEqual({
      status: 201,
      responseShippingFee: 0,
      responseTotal: 2_000,
      storedShippingFee: 0,
      storedTotal: 2_000,
      paymentAmount: 2_000,
    });
  });

  test("COD-API-017 payment-step database failure rolls back order, stock, voucher and cart", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codatomic",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "codatomic",
      discountType: "Fixed",
      discountValue: 500,
    });
    const variantIds = scenario.items.map((item) => item.variant.variant_id);
    const before = await mutationSnapshot(
      scenario.user.user_id,
      variantIds,
      voucher.voucher_id,
    );
    let response;

    await installPaymentFailureTrigger();
    try {
      response = await authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(scenario.account),
      ).send({
        addressId: scenario.address.address_id,
        voucherCode: voucher.code,
        paymentMethod: "COD",
      });
    } finally {
      await removePaymentFailureTrigger();
    }

    expect(response.status).toBe(500);
    expect(
      await mutationSnapshot(
        scenario.user.user_id,
        variantIds,
        voucher.voucher_id,
      ),
    ).toEqual(before);
  });

  test("COD-API-018 unexpected database failure returns a sanitized error envelope", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "coderrorsafe",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    let response;

    await installPaymentFailureTrigger();
    try {
      response = await authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(scenario.account),
      ).send({
        addressId: scenario.address.address_id,
        paymentMethod: "COD",
      });
    } finally {
      await removePaymentFailureTrigger();
    }

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý đơn hàng thất bại",
    });
    expectSafeErrorBody(response.body);
  });

  test("COD-API-019 sequential duplicate submit creates only one order and one stock decrement", async () => {
    const scenario = await createCheckoutScenario(prisma, {
      label: "codduplicate",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const token = createFixtureToken(scenario.account);
    const sendCheckout = () =>
      authorize(
        request(customerApp).post("/api/orders/checkout"),
        token,
      )
        .set("Idempotency-Key", "checkout-test-key")
        .send({
          addressId: scenario.address.address_id,
          paymentMethod: "COD",
        });
    const first = await sendCheckout();
    const second = await sendCheckout();
    const variant = await prisma.product_variants.findUnique({
      where: { variant_id: scenario.items[0].variant.variant_id },
    });

    expect([first.status, second.status]).toEqual([201, 400]);
    expect(
      await prisma.orders.count({
        where: { user_id: scenario.user.user_id },
      }),
    ).toBe(1);
    expect(
      await prisma.payment_transactions.count({
        where: { orders: { is: { user_id: scenario.user.user_id } } },
      }),
    ).toBe(1);
    expect(variant?.stock_quantity).toBe(4);
  });

  test("COD-API-020 Customer A checkout never changes Customer B cart", async () => {
    const customerA = await createCheckoutScenario(prisma, {
      label: "codisolationa",
      items: [
        {
          key: "item",
          price: 2_000,
          stockQuantity: 5,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const customerB = await createCheckoutScenario(prisma, {
      label: "codisolationb",
      items: [
        {
          key: "private",
          price: 9_000,
          stockQuantity: 4,
          quantity: 2,
          selected: true,
        },
      ],
    });
    const customerBBefore = await mutationSnapshot(
      customerB.user.user_id,
      customerB.items.map((item) => item.variant.variant_id),
    );
    const response = await authorize(
      request(customerApp).post("/api/orders/checkout"),
      createFixtureToken(customerA.account),
    ).send({
      addressId: customerA.address.address_id,
      paymentMethod: "COD",
    });

    expect(response.status).toBe(201);
    expect(
      await mutationSnapshot(
        customerB.user.user_id,
        customerB.items.map((item) => item.variant.variant_id),
      ),
    ).toEqual(customerBBefore);
  });

  test("COD-API-021 concurrent last-unit checkout allows one order and never negative stock", async () => {
    const customerA = await createCheckoutScenario(prisma, {
      label: "codconcurrenta",
      items: [
        {
          key: "shared",
          price: 2_000,
          stockQuantity: 1,
          quantity: 1,
          selected: true,
        },
      ],
    });
    const customerB = await createCheckoutScenario(prisma, {
      label: "codconcurrentb",
      items: [],
    });
    await prisma.cart_items.create({
      data: {
        cart_id: customerB.cart!.cart_id,
        variant_id: customerA.items[0].variant.variant_id,
        quantity: 1,
        selected: true,
      },
    });
    const requests = [
      authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(customerA.account),
      ).send({
        addressId: customerA.address.address_id,
        paymentMethod: "COD",
      }),
      authorize(
        request(customerApp).post("/api/orders/checkout"),
        createFixtureToken(customerB.account),
      ).send({
        addressId: customerB.address.address_id,
        paymentMethod: "COD",
      }),
    ];
    const responses = await Promise.all(requests);
    const variant = await prisma.product_variants.findUnique({
      where: { variant_id: customerA.items[0].variant.variant_id },
    });
    const orderCount = await prisma.orders.count({
      where: {
        user_id: {
          in: [customerA.user.user_id, customerB.user.user_id],
        },
      },
    });
    const paymentCount = await prisma.payment_transactions.count({
      where: {
        orders: {
          is: {
            user_id: {
              in: [customerA.user.user_id, customerB.user.user_id],
            },
          },
        },
      },
    });

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    expect(orderCount).toBe(1);
    expect(paymentCount).toBe(1);
    expect(variant?.stock_quantity).toBe(0);
  });
});
