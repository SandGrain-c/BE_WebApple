import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createInventorySerialScenario,
  installInventoryAuditFailureTrigger,
  removeInventoryAuditFailureTrigger,
  snapshotInventoryVariant,
} from "../../factories/inventory-serial.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeInventoryError(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /controlled inventory audit failure|PrismaClient|ConnectorError|constraint|SELECT |INSERT |UPDATE |postgres(?:ql)?:\/\/|\/Users\//i,
  );
}

describe.sequential("Inventory receipt integration", () => {
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

  test("INV-RCV-001 a valid serialized receipt atomically creates receipt/detail/items, increments stock and records actor audit", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptvalid",
    });
    const serials = [
      `${scenario.serialPrefix}-NEW-1`.slice(0, 50),
      `${scenario.serialPrefix}-NEW-2`.slice(0, 50),
    ];
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/inventory/receipts")
        .send({
          supplierId: scenario.supplierActive.supplier_id,
          items: [
            {
              variantId: scenario.serializedVariant.variant_id,
              quantity: 2,
              costPrice: 1_200,
              serialNumbers: serials,
            },
          ],
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      warehouseStaffId: manifest.accounts.warehouse_active.userId,
      supplierId: scenario.supplierActive.supplier_id,
      totalAmount: 2_400,
    });
    expect(after.variant?.stock_quantity).toBe(3);
    expect(after.details).toHaveLength(1);
    expect(after.details[0]).toMatchObject({
      variant_id: scenario.serializedVariant.variant_id,
      quantity: 2,
      cost_price: 1_200,
    });
    expect(
      after.items.filter((item) => serials.includes(item.serial_number)),
    ).toHaveLength(2);
    expect(
      after.items.filter((item) => item.status === 1),
    ).toHaveLength(3);
    expect(after.receipts).toHaveLength(1);
    expect(after.audits).toContainEqual(
      expect.objectContaining({
        user_id: manifest.accounts.warehouse_active.userId,
        action: "CREATE_INVENTORY_RECEIPT",
      }),
    );
  });

  test("INV-RCV-002 receipt ownership and stock are server-authoritative despite mass-assignment fields", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptmass",
    });
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/inventory/receipts")
        .send({
          warehouseStaffId: manifest.accounts.admin_active.userId,
          actorId: manifest.accounts.customer_active.userId,
          createdAt: "2020-01-01T00:00:00.000Z",
          stockBefore: 900,
          stockAfter: 999,
          totalAmount: 1,
          items: [
            {
              variantId: scenario.healthyVariant.variant_id,
              quantity: 2,
              costPrice: 100,
              stockBefore: 900,
              stockAfter: 999,
              status: "Sold",
              orderId: 999,
            },
          ],
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const persisted = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      warehouseStaffId: manifest.accounts.warehouse_active.userId,
      totalAmount: 200,
    });
    expect(persisted.variant?.stock_quantity).toBe(12);
    expect(persisted.receipts[0]?.warehouse_staff_id).toBe(
      manifest.accounts.warehouse_active.userId,
    );
    expect(persisted.details[0]?.quantity).toBe(2);
  });

  test("INV-RCV-003 nonexistent and inactive-product variants are rejected without receipt or stock mutation", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptvariant",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.inactiveProductVariant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const responses = [
      await authorize(
        request(adminApp)
          .post("/api/admin/inventory/receipts")
          .send({
            items: [
              {
                variantId: 2_147_483_647,
                quantity: 1,
                costPrice: 100,
              },
            ],
          }),
        token,
      ),
      await authorize(
        request(adminApp)
          .post("/api/admin/inventory/receipts")
          .send({
            items: [
              {
                variantId: scenario.inactiveProductVariant.variant_id,
                quantity: 1,
                costPrice: 100,
              },
            ],
          }),
        token,
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([404, 400]);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.inactiveProductVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("INV-RCV-004 zero, negative and fractional quantities are rejected without mutation", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptquantity",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const responses = [];

    for (const quantity of [0, -1, 1.5]) {
      responses.push(
        await authorize(
          request(adminApp)
            .post("/api/admin/inventory/receipts")
            .send({
              items: [
                {
                  variantId: scenario.healthyVariant.variant_id,
                  quantity,
                  costPrice: 100,
                },
              ],
            }),
          token,
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.healthyVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("INV-RCV-005 coercible quantity runtime types return 400 and never create receipt data", async () => {
    const quantities: unknown[] = ["2", [2], true];
    const results = [];

    for (const [index, quantity] of quantities.entries()) {
      const scenario = await createInventorySerialScenario(prisma, {
        label: `receipttype${index}`,
      });
      const before = await snapshotInventoryVariant(
        prisma,
        scenario.healthyVariant.variant_id,
      );
      const response = await authorize(
        request(adminApp)
          .post("/api/admin/inventory/receipts")
          .send({
            items: [
              {
                variantId: scenario.healthyVariant.variant_id,
                quantity,
                costPrice: 100,
              },
            ],
          }),
        createFixtureToken(manifest.accounts.admin_active),
      );
      const after = await snapshotInventoryVariant(
        prisma,
        scenario.healthyVariant.variant_id,
      );
      results.push({
        status: response.status,
        unchanged: JSON.stringify(after) === JSON.stringify(before),
      });
    }

    expect(results).toEqual([
      { status: 400, unchanged: true },
      { status: 400, unchanged: true },
      { status: 400, unchanged: true },
    ]);
  });

  test("INV-RCV-006 an iPhone serialized variant cannot receive counter stock without matching serials", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptmissingserial",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .post("/api/admin/inventory/receipts")
        .send({
          supplierId: scenario.supplierActive.supplier_id,
          items: [
            {
              variantId: scenario.serializedVariant.variant_id,
              quantity: 2,
              costPrice: 1_000,
            },
          ],
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

  test("INV-RCV-007 serial count mismatch and duplicates within/across receipt lines are rejected atomically", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptduplicates",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const serial = `${scenario.serialPrefix}-DUPLICATE`.slice(0, 50);
    const bodies = [
      {
        items: [
          {
            variantId: scenario.serializedVariant.variant_id,
            quantity: 2,
            costPrice: 100,
            serialNumbers: [serial],
          },
        ],
      },
      {
        items: [
          {
            variantId: scenario.serializedVariant.variant_id,
            quantity: 2,
            costPrice: 100,
            serialNumbers: [serial, serial],
          },
        ],
      },
      {
        items: [
          {
            variantId: scenario.serializedVariant.variant_id,
            quantity: 1,
            costPrice: 100,
            serialNumbers: [serial],
          },
          {
            variantId: scenario.serializedVariant.variant_id,
            quantity: 1,
            costPrice: 100,
            serialNumbers: [serial],
          },
        ],
      },
    ];
    const responses = [];

    for (const body of bodies) {
      responses.push(
        await authorize(
          request(adminApp)
            .post("/api/admin/inventory/receipts")
            .send(body),
          createFixtureToken(manifest.accounts.warehouse_active),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
  });

  test("INV-RCV-008 a database duplicate serial returns controlled 409 without partial receipt mutation", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptdbduplicate",
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
              serialNumbers: [scenario.availableItem.serial_number],
            },
          ],
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

  test("INV-RCV-009 concurrent receipts for one serial commit once and return a controlled conflict for the loser", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptconcurrent",
    });
    const serial = `${scenario.serialPrefix}-RACE`.slice(0, 50);
    const body = {
      items: [
        {
          variantId: scenario.serializedVariant.variant_id,
          quantity: 1,
          costPrice: 100,
          serialNumbers: [serial],
        },
      ],
    };
    const token = createFixtureToken(manifest.accounts.warehouse_active);
    const responses = await Promise.all([
      authorize(
        request(adminApp).post("/api/admin/inventory/receipts").send(body),
        token,
      ),
      authorize(
        request(adminApp).post("/api/admin/inventory/receipts").send(body),
        token,
      ),
    ]);
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );

    expect(
      after.items.filter((item) => item.serial_number === serial),
    ).toHaveLength(1);
    expect(after.variant?.stock_quantity).toBe(2);
    expect(after.details).toHaveLength(1);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    responses
      .filter((response) => response.status !== 201)
      .forEach((response) => expectSafeInventoryError(response.body));
  });

  test("INV-RCV-010 audit persistence failure rolls back receipt, stock and serials and returns a sanitized 500", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "receiptrollback",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const trigger = await installInventoryAuditFailureTrigger(prisma, {
      actor: manifest.accounts.warehouse_active,
      action: "CREATE_INVENTORY_RECEIPT",
    });
    let response;

    try {
      response = await authorize(
        request(adminApp)
          .post("/api/admin/inventory/receipts")
          .send({
            items: [
              {
                variantId: scenario.serializedVariant.variant_id,
                quantity: 1,
                costPrice: 100,
                serialNumbers: [
                  `${scenario.serialPrefix}-ROLLBACK`.slice(0, 50),
                ],
              },
            ],
          }),
        createFixtureToken(manifest.accounts.warehouse_active),
      );
    } finally {
      await removeInventoryAuditFailureTrigger(prisma, trigger);
    }

    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.serializedVariant.variant_id,
      ),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý tồn kho thất bại",
    });
    expectSafeInventoryError(response.body);
  });
});
