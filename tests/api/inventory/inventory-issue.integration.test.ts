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

function expectSafeInventoryIssueError(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /controlled inventory audit failure|PrismaClient|ConnectorError|constraint|SELECT |INSERT |UPDATE |postgres(?:ql)?:\/\/|\/Users\//i,
  );
}

describe.sequential("Inventory stock issue and adjustment integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  const adjustmentPath = (variantId: number) =>
    `/api/admin/inventory/variants/${variantId}/stock`;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  test("INV-ISS-001 WarehouseStaff can issue valid quantity and the audit actor/reason come from the request context", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issuevalid",
    });
    const response = await authorize(
      request(adminApp)
        .patch(adjustmentPath(scenario.healthyVariant.variant_id))
        .send({
          type: "decrease",
          quantity: 3,
          reason: "Controlled inventory issue",
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.stockQuantity).toBe(7);
    expect(after.variant?.stock_quantity).toBe(7);
    expect(after.audits).toContainEqual(
      expect.objectContaining({
        user_id: manifest.accounts.warehouse_active.userId,
        action: "ADJUST_STOCK",
        entity_id: scenario.healthyVariant.variant_id,
      }),
    );
  });

  test("INV-ISS-002 issuing exactly all available counter stock reaches zero without becoming negative", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issueexact",
    });
    const response = await authorize(
      request(adminApp)
        .patch(adjustmentPath(scenario.healthyVariant.variant_id))
        .send({
          type: "decrease",
          quantity: 10,
          reason: "Issue exact stock",
        }),
      createFixtureToken(manifest.accounts.admin_active),
    );
    const variant = await prisma.product_variants.findUnique({
      where: { variant_id: scenario.healthyVariant.variant_id },
    });

    expect(response.status).toBe(200);
    expect(variant?.stock_quantity).toBe(0);
    expect(variant?.stock_quantity).toBeGreaterThanOrEqual(0);
  });

  test("INV-ISS-003 over-stock, negative and fractional issue quantities are rejected without mutation", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issueinvalid",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );
    const token = createFixtureToken(manifest.accounts.admin_active);
    const responses = [];

    for (const quantity of [11, -1, 1.5]) {
      responses.push(
        await authorize(
          request(adminApp)
            .patch(adjustmentPath(scenario.healthyVariant.variant_id))
            .send({
              type: "decrease",
              quantity,
              reason: "Invalid issue",
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

  test("INV-ISS-004 coercible quantity runtime types return 400 and do not alter stock", async () => {
    const quantities: unknown[] = ["2", [2], true];
    const results = [];

    for (const [index, quantity] of quantities.entries()) {
      const scenario = await createInventorySerialScenario(prisma, {
        label: `issuetype${index}`,
      });
      const before = await snapshotInventoryVariant(
        prisma,
        scenario.healthyVariant.variant_id,
      );
      const response = await authorize(
        request(adminApp)
          .patch(adjustmentPath(scenario.healthyVariant.variant_id))
          .send({
            type: "decrease",
            quantity,
            reason: "Runtime type validation",
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

  test("INV-ISS-005 client-supplied actor and before/after stock fields cannot override authoritative values", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issuemass",
    });
    const response = await authorize(
      request(adminApp)
        .patch(adjustmentPath(scenario.healthyVariant.variant_id))
        .send({
          type: "decrease",
          quantity: 2,
          reason: "Authoritative adjustment",
          actorId: manifest.accounts.customer_active.userId,
          userId: manifest.accounts.customer_active.userId,
          oldStock: 900,
          newStock: 999,
          createdAt: "2020-01-01T00:00:00.000Z",
        }),
      createFixtureToken(manifest.accounts.warehouse_active),
    );
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );

    expect(response.status).toBe(200);
    expect(after.variant?.stock_quantity).toBe(8);
    expect(after.audits).toContainEqual(
      expect.objectContaining({
        user_id: manifest.accounts.warehouse_active.userId,
      }),
    );
  });

  test("INV-ISS-006 concurrent issue of the final unit permits one winner and one controlled 409", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issueconcurrent",
    });
    const token = createFixtureToken(manifest.accounts.warehouse_active);
    const endpoint = adjustmentPath(
      scenario.serializedVariant.variant_id,
    );
    const body = {
      type: "decrease",
      quantity: 1,
      reason: "Concurrent last-unit issue",
    };
    const responses = await Promise.all([
      authorize(request(adminApp).patch(endpoint).send(body), token),
      authorize(request(adminApp).patch(endpoint).send(body), token),
    ]);
    const after = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );

    expect(after.variant?.stock_quantity).toBe(0);
    expect(after.audits).toHaveLength(1);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
  });

  test("INV-ISS-007 manual adjustment cannot diverge an iPhone stock counter from its InStock serial count", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issueinvariant",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.serializedVariant.variant_id,
    );
    const response = await authorize(
      request(adminApp)
        .patch(adjustmentPath(scenario.serializedVariant.variant_id))
        .send({
          type: "increase",
          quantity: 1,
          reason: "Counter-only serialized adjustment",
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

  test("INV-ISS-008 audit persistence failure rolls back stock and returns a sanitized 500", async () => {
    const scenario = await createInventorySerialScenario(prisma, {
      label: "issuerollback",
    });
    const before = await snapshotInventoryVariant(
      prisma,
      scenario.healthyVariant.variant_id,
    );
    const trigger = await installInventoryAuditFailureTrigger(prisma, {
      actor: manifest.accounts.warehouse_active,
      action: "ADJUST_STOCK",
    });
    let response;

    try {
      response = await authorize(
        request(adminApp)
          .patch(adjustmentPath(scenario.healthyVariant.variant_id))
          .send({
            type: "decrease",
            quantity: 1,
            reason: "Rollback adjustment",
          }),
        createFixtureToken(manifest.accounts.warehouse_active),
      );
    } finally {
      await removeInventoryAuditFailureTrigger(prisma, trigger);
    }

    expect(
      await snapshotInventoryVariant(
        prisma,
        scenario.healthyVariant.variant_id,
      ),
    ).toEqual(before);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý tồn kho thất bại",
    });
    expectSafeInventoryIssueError(response.body);
  });
});
