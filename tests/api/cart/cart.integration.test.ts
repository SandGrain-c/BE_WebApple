import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createCartItemFixture,
  createIsolatedCustomer,
} from "../../factories/cart-address.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

const CART_ITEM_KEYS = [
  "capacity",
  "cartItemId",
  "categorySlug",
  "color",
  "image",
  "name",
  "oldPrice",
  "price",
  "productId",
  "quantity",
  "ram",
  "selected",
  "sku",
  "slug",
  "stockQuantity",
  "variantId",
].sort();

function expectSafeCartItemShape(item: Record<string, unknown>) {
  expect(Object.keys(item).sort()).toEqual(CART_ITEM_KEYS);
  const serialized = JSON.stringify(item);

  for (const internalKey of [
    "cart_id",
    "cart_item_id",
    "user_id",
    "variant_id",
    "product_id",
    "stock_quantity",
    "pass_hash",
  ]) {
    expect(serialized).not.toContain(`"${internalKey}"`);
  }
}

describe.sequential("Cart business rules integration", () => {
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

  test("CART-API-001 anonymous cart requests return 401", async () => {
    const responses = [
      await request(customerApp).get("/api/cart"),
      await request(customerApp).post("/api/cart/items").send({}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false });
    }
  });

  test("CART-API-002 customer without a cart receives an empty canonical envelope", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartempty");
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).get("/api/cart"),
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Giỏ hàng đang trống",
      data: {
        items: [],
        totalQuantity: 0,
        totalPrice: 0,
        selectedQuantity: 0,
        selectedTotalPrice: 0,
      },
    });
    expect(
      await prisma.carts.findUnique({
        where: { user_id: customer.user.user_id },
      }),
    ).toBeNull();
  });

  test("CART-API-003 add uses authenticated owner, DB price and default quantity", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartadd");
    const other = await createIsolatedCustomer(prisma, "cartaddother");
    const otherCartItem = await createCartItemFixture(prisma, {
      userId: other.user.user_id,
      variantId: manifest.catalog.variant_stock_1.variantId,
      quantity: 1,
      selected: false,
    });
    const otherBefore = await prisma.cart_items.findUnique({
      where: { cart_item_id: otherCartItem.item.cart_item_id },
    });
    const variantBefore = await prisma.product_variants.findUnique({
      where: {
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
      select: { price: true, stock_quantity: true },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).post("/api/cart/items"),
      token,
    ).send({
      productId: manifest.catalog.product_active.productId,
      variantId: manifest.catalog.variant_stock_10.variantId,
      userId: other.user.user_id,
      price: 1,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      totalQuantity: 1,
      totalPrice: manifest.catalog.variant_stock_10.price,
      selectedQuantity: 1,
      selectedTotalPrice: manifest.catalog.variant_stock_10.price,
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      productId: manifest.catalog.product_active.productId,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 1,
      selected: true,
      price: manifest.catalog.variant_stock_10.price,
      stockQuantity: manifest.catalog.variant_stock_10.stockQuantity,
      name: expect.any(String),
      slug: manifest.catalog.product_active.slug,
      categorySlug: manifest.catalog.category_active.slug,
    });
    expectSafeCartItemShape(response.body.data.items[0]);

    const stored = await prisma.cart_items.findFirst({
      where: {
        carts: { is: { user_id: customer.user.user_id } },
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
      include: { carts: true },
    });
    expect(stored).toMatchObject({
      variant_id: manifest.catalog.variant_stock_10.variantId,
      quantity: 1,
      selected: true,
      carts: { user_id: customer.user.user_id },
    });
    expect(
      await prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { price: true, stock_quantity: true },
      }),
    ).toEqual(variantBefore);
    expect(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: otherCartItem.item.cart_item_id },
      }),
    ).toEqual(otherBefore);
  });

  test("CART-API-004 missing, inactive-product and out-of-stock variants create no item", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartreject");
    const token = createFixtureToken(customer.account);
    const aggregate = await prisma.product_variants.aggregate({
      _max: { variant_id: true },
    });
    const missingVariantId = (aggregate._max.variant_id ?? 0) + 1000;
    const variantsBefore = await prisma.product_variants.findMany({
      where: {
        variant_id: {
          in: [
            manifest.catalog.variant_out_of_stock.variantId,
            manifest.catalog.variant_inactive_product.variantId,
          ],
        },
      },
      orderBy: { variant_id: "asc" },
      select: { variant_id: true, price: true, stock_quantity: true },
    });
    const cases = [
      {
        expectedStatus: 404,
        payload: {
          productId: manifest.catalog.product_active.productId,
          variantId: missingVariantId,
        },
      },
      {
        expectedStatus: 400,
        payload: {
          productId: manifest.catalog.product_inactive.productId,
          variantId:
            manifest.catalog.variant_inactive_product.variantId,
        },
      },
      {
        expectedStatus: 400,
        payload: {
          productId: manifest.catalog.product_secondary.productId,
          variantId: manifest.catalog.variant_out_of_stock.variantId,
        },
      },
    ];

    for (const scenario of cases) {
      const response = await authorize(
        request(customerApp).post("/api/cart/items"),
        token,
      ).send(scenario.payload);
      expect(response.status).toBe(scenario.expectedStatus);
      expect(response.body).toMatchObject({ success: false });
    }

    expect(
      await prisma.cart_items.count({
        where: { carts: { is: { user_id: customer.user.user_id } } },
      }),
    ).toBe(0);
    expect(
      await prisma.product_variants.findMany({
        where: {
          variant_id: {
            in: [
              manifest.catalog.variant_out_of_stock.variantId,
              manifest.catalog.variant_inactive_product.variantId,
            ],
          },
        },
        orderBy: { variant_id: "asc" },
        select: { variant_id: true, price: true, stock_quantity: true },
      }),
    ).toEqual(variantsBefore);
  });

  test("FLOW-CART-001 duplicate add increments one unique item and reselects it", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartduplicate");
    const token = createFixtureToken(customer.account);
    const payload = {
      productId: manifest.catalog.product_active.productId,
      variantId: manifest.catalog.variant_stock_10.variantId,
    };

    const first = await authorize(
      request(customerApp).post("/api/cart/items"),
      token,
    ).send({ ...payload, quantity: 1 });
    const itemId = first.body.data.items[0].cartItemId;
    await prisma.cart_items.update({
      where: { cart_item_id: itemId },
      data: { selected: false },
    });
    const second = await authorize(
      request(customerApp).post("/api/cart/items"),
      token,
    ).send({ ...payload, quantity: 2 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.items[0]).toMatchObject({
      cartItemId: itemId,
      quantity: 3,
      selected: true,
    });
    const rows = await prisma.cart_items.findMany({
      where: {
        carts: { is: { user_id: customer.user.user_id } },
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 3, selected: true });
  });

  test("CART-API-005 duplicate add cannot exceed stock and leaves existing quantity unchanged", async () => {
    const customer = await createIsolatedCustomer(
      prisma,
      "cartduplicatestock",
    );
    const token = createFixtureToken(customer.account);
    const payload = {
      productId: manifest.catalog.product_active.productId,
      variantId: manifest.catalog.variant_stock_10.variantId,
    };
    const first = await authorize(
      request(customerApp).post("/api/cart/items"),
      token,
    ).send({ ...payload, quantity: 9 });
    const before = await prisma.cart_items.findUnique({
      where: { cart_item_id: first.body.data.items[0].cartItemId },
    });

    const response = await authorize(
      request(customerApp).post("/api/cart/items"),
      token,
    ).send({ ...payload, quantity: 2 });

    expect(response.status).toBe(400);
    expect(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: before!.cart_item_id },
      }),
    ).toEqual(before);
  });

  test("CART-API-006 quantity can increase, decrease and equal current stock without changing stock", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartquantity");
    const fixture = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    const variantBefore = await prisma.product_variants.findUnique({
      where: {
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
      select: { price: true, stock_quantity: true },
    });
    const token = createFixtureToken(customer.account);

    for (const quantity of [4, 1, 10]) {
      const response = await authorize(
        request(customerApp).patch(
          `/api/cart/items/${fixture.item.cart_item_id}`,
        ),
        token,
      ).send({ quantity });
      expect(response.status).toBe(200);
      expect(response.body.data.items[0].quantity).toBe(quantity);
      expect(
        await prisma.cart_items.findUnique({
          where: { cart_item_id: fixture.item.cart_item_id },
        }),
      ).toMatchObject({ quantity });
    }

    expect(
      await prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { price: true, stock_quantity: true },
      }),
    ).toEqual(variantBefore);
  });

  test("CART-API-007 over-stock, negative and fractional quantity are rejected without mutation", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartqtyinvalid");
    const fixture = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    const before = await prisma.cart_items.findUnique({
      where: { cart_item_id: fixture.item.cart_item_id },
    });
    const stockBefore = await prisma.product_variants.findUnique({
      where: {
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
      select: { stock_quantity: true },
    });
    const token = createFixtureToken(customer.account);

    for (const quantity of [11, -1, 1.5]) {
      const response = await authorize(
        request(customerApp).patch(
          `/api/cart/items/${fixture.item.cart_item_id}`,
        ),
        token,
      ).send({ quantity });
      expect(response.status).toBe(400);
      expect(
        await prisma.cart_items.findUnique({
          where: { cart_item_id: fixture.item.cart_item_id },
        }),
      ).toEqual(before);
    }

    expect(
      await prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { stock_quantity: true },
      }),
    ).toEqual(stockBefore);
  });

  test("CART-API-008 numeric-string quantity is rejected and cannot mutate the row", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartqtystring");
    const fixture = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    const before = await prisma.cart_items.findUnique({
      where: { cart_item_id: fixture.item.cart_item_id },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).patch(
        `/api/cart/items/${fixture.item.cart_item_id}`,
      ),
      token,
    ).send({ quantity: "3" });

    expect.soft(response.status, "numeric string must be rejected").toBe(400);
    expect.soft(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: fixture.item.cart_item_id },
      }),
      "invalid runtime type must not mutate quantity",
    ).toEqual(before);
  });

  test("CART-API-009 selected toggles and select-all affect only current customer totals", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartselected");
    const first = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    const second = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_1.variantId,
      quantity: 1,
      selected: false,
    });
    const other = await createIsolatedCustomer(prisma, "cartselectedother");
    const otherItem = await createCartItemFixture(prisma, {
      userId: other.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 1,
      selected: true,
    });
    const otherBefore = await prisma.cart_items.findUnique({
      where: { cart_item_id: otherItem.item.cart_item_id },
    });
    const token = createFixtureToken(customer.account);

    const unselectOne = await authorize(
      request(customerApp).patch(
        `/api/cart/items/${first.item.cart_item_id}/selected`,
      ),
      token,
    ).send({ selected: false });
    expect(unselectOne.status).toBe(200);
    expect(unselectOne.body.data).toMatchObject({
      selectedQuantity: 0,
      selectedTotalPrice: 0,
    });

    const selectOne = await authorize(
      request(customerApp).patch(
        `/api/cart/items/${first.item.cart_item_id}/selected`,
      ),
      token,
    ).send({ selected: true });
    expect(selectOne.status).toBe(200);
    expect(selectOne.body.data).toMatchObject({
      selectedQuantity: 2,
      selectedTotalPrice:
        manifest.catalog.variant_stock_10.price * 2,
    });

    const selectAll = await authorize(
      request(customerApp).patch("/api/cart/select-all"),
      token,
    ).send({ selected: true });
    expect(selectAll.status).toBe(200);
    expect(selectAll.body.data).toMatchObject({
      selectedQuantity: 3,
      selectedTotalPrice:
        manifest.catalog.variant_stock_10.price * 2 +
        manifest.catalog.variant_stock_1.price,
    });

    const unselectAll = await authorize(
      request(customerApp).patch("/api/cart/select-all"),
      token,
    ).send({ selected: false });
    expect(unselectAll.status).toBe(200);
    expect(unselectAll.body.data).toMatchObject({
      selectedQuantity: 0,
      selectedTotalPrice: 0,
    });

    const ownRows = await prisma.cart_items.findMany({
      where: { carts: { is: { user_id: customer.user.user_id } } },
      orderBy: { cart_item_id: "asc" },
    });
    expect(ownRows).toHaveLength(2);
    expect(ownRows.every((item) => item.selected === false)).toBe(true);
    expect(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: otherItem.item.cart_item_id },
      }),
    ).toEqual(otherBefore);
    expect(second.item.selected).toBe(false);
  });

  test("CART-API-010 delete removes one item, is repeat-safe and never changes stock", async () => {
    const customer = await createIsolatedCustomer(prisma, "cartdelete");
    const fixture = await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    const stockBefore = await prisma.product_variants.findUnique({
      where: {
        variant_id: manifest.catalog.variant_stock_10.variantId,
      },
      select: { stock_quantity: true },
    });
    const token = createFixtureToken(customer.account);

    const firstResponse = await authorize(
      request(customerApp).delete(
        `/api/cart/items/${fixture.item.cart_item_id}`,
      ),
      token,
    );
    const secondResponse = await authorize(
      request(customerApp).delete(
        `/api/cart/items/${fixture.item.cart_item_id}`,
      ),
      token,
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(404);
    expect(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: fixture.item.cart_item_id },
      }),
    ).toBeNull();
    expect(
      await prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { stock_quantity: true },
      }),
    ).toEqual(stockBefore);
  });

  test("CART-API-011 totals use current decimal DB prices, quantities and selected state", async () => {
    const customer = await createIsolatedCustomer(prisma, "carttotals");
    await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_10.variantId,
      quantity: 2,
      selected: true,
    });
    await createCartItemFixture(prisma, {
      userId: customer.user.user_id,
      variantId: manifest.catalog.variant_stock_1.variantId,
      quantity: 1,
      selected: false,
    });
    const variantsBefore = await prisma.product_variants.findMany({
      where: {
        variant_id: {
          in: [
            manifest.catalog.variant_stock_10.variantId,
            manifest.catalog.variant_stock_1.variantId,
          ],
        },
      },
      orderBy: { variant_id: "asc" },
      select: { variant_id: true, price: true, stock_quantity: true },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).get("/api/cart"),
      token,
    );

    const stockTenLineTotal =
      manifest.catalog.variant_stock_10.price * 2;
    const stockOneLineTotal =
      manifest.catalog.variant_stock_1.price * 1;
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totalQuantity: 3,
      totalPrice: stockTenLineTotal + stockOneLineTotal,
      selectedQuantity: 2,
      selectedTotalPrice: stockTenLineTotal,
    });
    expect(response.body.data.items).toHaveLength(2);
    for (const item of response.body.data.items) {
      expect(typeof item.price).toBe("number");
      expect(Number.isNaN(item.price * item.quantity)).toBe(false);
      expectSafeCartItemShape(item);
    }
    expect(
      await prisma.product_variants.findMany({
        where: {
          variant_id: {
            in: [
              manifest.catalog.variant_stock_10.variantId,
              manifest.catalog.variant_stock_1.variantId,
            ],
          },
        },
        orderBy: { variant_id: "asc" },
        select: { variant_id: true, price: true, stock_quantity: true },
      }),
    ).toEqual(variantsBefore);
  });
});
