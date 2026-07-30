import { beforeAll, describe, expect, inject, test } from "vitest";
import type { Express } from "express";
import { assertCurrentProcessUsesSafeTestDatabase } from "../setup/database-safety";
import {
  captureSecurityDatabaseState,
  createFixtureToken,
  sendApiRequest,
  withFixtureAuthorization,
} from "./security-test-helpers";

describe.sequential("SEC-RBAC-002 authorization ordering", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../src/apps/admin/admin.app"
    ));
  });

  const cases: Array<{
    id: string;
    role: "Staff" | "WarehouseStaff";
    method: "post" | "patch";
    path: () => string;
  }> = [
    {
      id: "SEC-RBAC-002-ORDER-STAFF-CREATE",
      role: "Staff",
      method: "post",
      path: () => "/api/admin/staff",
    },
    {
      id: "SEC-RBAC-002-ORDER-STAFF-UPDATE",
      role: "Staff",
      method: "patch",
      path: () =>
        `/api/admin/staff/${manifest.accounts.warehouse_active.userId}`,
    },
    {
      id: "SEC-RBAC-002-ORDER-PRODUCT-CREATE",
      role: "WarehouseStaff",
      method: "post",
      path: () => "/api/admin/products",
    },
    {
      id: "SEC-RBAC-002-ORDER-VOUCHER-CREATE",
      role: "WarehouseStaff",
      method: "post",
      path: () => "/api/admin/vouchers",
    },
    {
      id: "SEC-RBAC-002-ORDER-INVENTORY-ADJUST",
      role: "Staff",
      method: "patch",
      path: () =>
        `/api/admin/inventory/variants/${manifest.catalog.variant_stock_10.variantId}/stock`,
    },
    {
      id: "SEC-RBAC-002-ORDER-REVIEW-MODERATION",
      role: "WarehouseStaff",
      method: "patch",
      path: () =>
        `/api/admin/reviews/${manifest.ownership.review_b.reviewId}/visibility`,
    },
  ];

  const accountByRole = {
    Staff: manifest.accounts.staff_active,
    WarehouseStaff: manifest.accounts.warehouse_active,
  } as const;

  for (const testCase of cases) {
    test(`${testCase.id} returns 403 before invalid-payload validation`, async () => {
      const before = await captureSecurityDatabaseState();
      const response = await withFixtureAuthorization(
        sendApiRequest(adminApp, testCase.method, testCase.path()),
        createFixtureToken(accountByRole[testCase.role]),
      ).send({});

      expect(response.status).toBe(403);
      expect(await captureSecurityDatabaseState()).toEqual(before);
    });
  }
});
