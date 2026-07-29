import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createInventorySerialScenario,
  snapshotInventoryVariant,
} from "../../factories/inventory-serial.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeSerialError(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /PrismaClient|ConnectorError|constraint|SELECT |INSERT |UPDATE |postgres(?:ql)?:\/\/|\/Users\//i,
  );
}

describe.sequential("Serialized inventory receipt and item integrity", () => {
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

  test("SER-RCV-001 one valid serial is trimmed, linked to its receipt detail and created InStock", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialsingle",
    });
    const serial = `${scenario.serialPrefix}-SINGLE`.slice(0, 50);
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/inventory/receipts")
        .send({
          items: [
            {
              variantId: scenario.serializedVariant.variant_id,
              quantity: 1,
              costPrice: 100,
              serialNumbers: [`  ${serial}  `],
            },
          ],
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const item = await prisma.product_items.findUnique({
      where: { serial_number: serial },
    });

    expect(response.status).toBe(201);
    expect(item).toMatchObject({
      variant_id: scenario.serializedVariant.variant_id,
      serial_number: serial,
      status: 1,
    });
    expect(item?.import_receipt_detail_id).not.toBeNull();
    expect(item?.order_detail_id).toBeNull();
  });

  test("SER-RCV-002 multiple unique serials preserve variant, receipt linkage and counter equality", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialmultiple",
    });
    const serials = [1, 2, 3].map((index) =>
      `${scenario.serialPrefix}-MULTI-${index}`.slice(0, 50),
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/inventory/receipts")
        .send({
          items: [
            {
              variantId: scenario.serializedVariant.variant_id,
              quantity: serials.length,
              costPrice: 100,
              serialNumbers: serials,
            },
          ],
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );

    expect(response.status).toBe(201);
    expect(
      after.items.filter((item) => serials.includes(item.serial_number)),
    ).toHaveLength(3);
    expect(after.variant?.stock_quantity).toBe(4);
    expect(
      after.items.filter((item) => item.status === 1),
    ).toHaveLength(4);
  });

  test("SER-RCV-003 trimmed serial duplicates already stored in PostgreSQL are rejected with 409", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialstoreddup",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/product-items")
        .send({
          variantId: scenario.serializedVariant.variant_id,
          serialNumber: `  ${scenario.availableItem.serial_number}  `,
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(409);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("SER-RCV-004 non-string serial runtime types return controlled 400 without partial receipt mutation", async () => {
    const invalidSerials: unknown[] = [12345, ["SERIAL"], true, {}];
    const results = [];

    for (const [index, serialNumber] of invalidSerials.entries()) {
      const scenario = await createInventorySerialScenario(prisma, {
        label: `serialtype${index}`,
      });
      const before = await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      );
      const response = await authorize(
        request(adminApp)
          .post("/api/admin/inventory/receipts")
          .send({
            items: [
              {
                variantId: scenario.serializedVariant.variant_id,
                quantity: 1,
                costPrice: 100,
                serialNumbers: [serialNumber],
              },
            ],
          }),
        createFixtureToken(manifest.accounts.warehouse_active),
      );
      const after = await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      );

      results.push({
        status: response.status,
        unchanged: JSON.stringify(after) === JSON.stringify(before),
        body: response.body,
      });
    }

    expect(
      results.map(({ status, unchanged }) => ({ status, unchanged })),
    ).toEqual(
      invalidSerials.map(() => ({ status: 400, unchanged: true })),
    );
    results.forEach((result) => expectSafeSerialError(result.body));
  });

  test("SER-RCV-005 product-item creation cannot mass-assign Sold status or order fields", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialmassassign",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/product-items")
        .send({
          variantId: scenario.serializedVariant.variant_id,
          serialNumber: `${scenario.serialPrefix}-CLIENT-SOLD`.slice(0, 50),
          status: "Sold",
          orderId: 999,
          orderDetailId: 999,
          soldAt: "2020-01-01T00:00:00.000Z",
          reservationId: 999,
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("SER-RCV-006 a Sold serial cannot be changed back to InStock through generic status update", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialsoldstatus",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(
          `/api/admin/product-items/${scenario.soldItem.item_id}`,
        )
        .send({ status: "InStock" }),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("SER-RCV-007 a Sold serial cannot be soft-deleted", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialsolddelete",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp).delete(
        `/api/admin/product-items/${scenario.soldItem.item_id}`,
      ),
      createFixtureToken(manifest.accounts.admin_active),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("SER-RCV-008 standalone InStock serial creation cannot break the serialized counter invariant", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialcounterdrift",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/product-items")
        .send({
          variantId: scenario.serializedVariant.variant_id,
          serialNumber: `${scenario.serialPrefix}-DRIFT`.slice(0, 50),
          status: "InStock",
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );

    expect(response.status).toBe(409);
    expect(after).toEqual(before);
    expect(after.variant?.stock_quantity).toBe(
      after.items.filter((item) => item.status === 1).length,
    );
  });

  test("SER-RCV-009 concurrent standalone creation of one serial commits once and sanitizes the loser conflict", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "serialcreateconcurrent",
    });
    const serial = `${scenario.serialPrefix}-CREATE-RACE`.slice(0, 50);
    const body = {
      variantId: scenario.healthyVariant.variant_id,
      serialNumber: serial,
      status: "InStock",
    };
    const token = createFixtureToken(manifest.accounts.warehouse_active);
    const responses = await Promise.all([
      authorize(
        request(adminApp).post("/api/admin/product-items").send(body),
        token,
      ),
      authorize(
        request(adminApp).post("/api/admin/product-items").send(body),
        token,
      ),
    ]);
    const stored = await prisma.product_items.findMany({
      where: { serial_number: serial },
    });

    expect(stored).toHaveLength(1);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    responses
      .filter((response) => response.status !== 201)
      .forEach((response) => expectSafeSerialError(response.body));
  });
});
