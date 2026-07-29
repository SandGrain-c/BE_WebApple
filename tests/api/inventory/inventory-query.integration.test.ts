import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import { createInventorySerialScenario } from "../../factories/inventory-serial.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

describe.sequential("Inventory and serial query integration", () => {
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

  test("INV-QRY-001 inventory query rejects anonymous, invalid-token and locked accounts", async () => {
    const endpoint = "/api/admin/inventory/variants";
    const responses = [
      await request(adminApp).get(endpoint),
      await authorize(request(adminApp).get(endpoint), "invalid-token"),
      await authorize(
        request(adminApp).get(endpoint),
        createFixtureToken(manifest.accounts.admin_locked),
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401,
    ]);
  });

  test("INV-QRY-002 inventory RBAC permits Admin and WarehouseStaff but denies Customer, Staff and unknown role", async () => {
    const endpoint = "/api/admin/inventory/variants";
    const accounts = [
      manifest.accounts.admin_active,
      manifest.accounts.warehouse_active,
      manifest.accounts.customer_active,
      manifest.accounts.staff_active,
      manifest.accounts.unknown_role_active,
    ];
    const responses = [];

    for (const account of accounts) {
      responses.push(
        await authorize(
          request(adminApp).get(endpoint),
          createFixtureToken(account),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 403, 403, 403,
    ]);
  });

  test("INV-QRY-003 authorized product and SKU filters return safe variant inventory data", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "queryfilters",
    });
    const response = await authorize(
      request(adminApp)
        .get("/api/admin/inventory/variants")
        .query({
          productId: String(scenario.product.product_id),
          search: scenario.serializedVariant.sku,
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      variantId: scenario.serializedVariant.variant_id,
      productId: scenario.product.product_id,
      sku: scenario.serializedVariant.sku,
      stockQuantity: 1,
      totalProductItems: 3,
      inStockItems: 1,
    });
    expect(serialized).not.toMatch(
      /pass_hash|JWT_SECRET|DATABASE_URL|gateway_response|customer_phone/i,
    );
  });

  test("INV-QRY-004 stock-status filters use the variant stock counter and configured threshold", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "querystock",
    });
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = "/api/admin/inventory/variants";
    const statuses = ["in-stock", "low-stock", "out-of-stock"];
    const result: Record<string, number[]> = {};

    for (const stockStatus of statuses) {
      const response = await authorize(
        request(adminApp).get(endpoint).query({
          productId: scenario.product.product_id,
          stockStatus,
          lowStockThreshold: 5,
          limit: 100,
        }),
        token,
      );
      expect(response.status).toBe(200);
      result[stockStatus] = response.body.data.items.map(
        (item: { variantId: number }) => item.variantId,
      );
    }

    expect(result["in-stock"]).toEqual([
      scenario.healthyVariant.variant_id,
    ]);
    expect(new Set(result["low-stock"])).toEqual(
      new Set([
        scenario.serializedVariant.variant_id,
        scenario.lowStockVariant.variant_id,
      ]),
    );
    expect(result["out-of-stock"]).toEqual([
      scenario.outOfStockVariant.variant_id,
    ]);
  });

  test("INV-QRY-005 valid numeric query strings paginate and the maximum limit is capped at 100", async () => {
    const response = await authorize(
      request(adminApp).get("/api/admin/inventory/variants").query({
        page: "1",
        limit: "1000",
      }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      limit: 100,
    });
    expect(response.body.data.items.length).toBeLessThanOrEqual(100);
  });

  test("INV-QRY-006 invalid pagination runtime values return controlled 400 instead of silent defaults", async () => {
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = "/api/admin/inventory/variants";
    const queries: Array<Record<string, unknown>> = [
      { page: 0 },
      { page: -1 },
      { page: 1.5 },
      { page: ["1", "2"] },
      { limit: 0 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: true },
    ];
    const responses = [];

    for (const query of queries) {
      responses.push(
        await authorize(request(adminApp).get(endpoint).query(query), token),
      );
    }

    expect(responses.map((response) => response.status)).toEqual(
      queries.map(() => 400),
    );
    responses.forEach((response) => {
      expect(response.body).toMatchObject({ success: false });
    });
  });

  test("INV-QRY-007 invalid inventory enums and identifiers return controlled 400", async () => {
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = "/api/admin/inventory/variants";
    const queries = [
      { stockStatus: "unknown-stock" },
      { sort: "unknown-sort" },
      { productId: -1 },
      { lowStockThreshold: -1 },
    ];
    const responses = [];

    for (const query of queries) {
      responses.push(
        await authorize(request(adminApp).get(endpoint).query(query), token),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
  });

  test("INV-QRY-008 product-item query filters by product, variant, status and serial without unrelated data", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "queryserial",
    });
    const response = await authorize(
      request(adminApp).get("/api/admin/product-items").query({
        productId: scenario.product.product_id,
        variantId: scenario.serializedVariant.variant_id,
        status: "Reserved",
        q: scenario.reservedItem.serial_number,
      }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      productItemId: scenario.reservedItem.item_id,
      variantId: scenario.serializedVariant.variant_id,
      serialNumber: scenario.reservedItem.serial_number,
      status: "Reserved",
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /pass_hash|customer_phone|gateway_response|audit/i,
    );
  });

  test("INV-QRY-009 invalid product-item filters and pagination return controlled 400", async () => {
    const token = createFixtureToken(manifest.accounts.admin_active);
    const endpoint = "/api/admin/product-items";
    const queries = [
      { status: "Unknown" },
      { variantId: "not-an-id" },
      { productId: -1 },
      { page: 0 },
      { limit: ["1", "2"] },
    ];
    const responses = [];

    for (const query of queries) {
      responses.push(
        await authorize(request(adminApp).get(endpoint).query(query), token),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400, 400,
    ]);
  });
});
