import { beforeAll, describe, expect, inject, test } from "vitest";
import type { Express } from "express";
import { assertCurrentProcessUsesSafeTestDatabase } from "../setup/database-safety";
import {
  canonicalAdminRoles,
  rbacRouteManifest,
  type CanonicalAdminRole,
} from "./rbac-route-manifest";
import {
  captureSecurityDatabaseState,
  createFixtureToken,
  sendApiRequest,
  withFixtureAuthorization,
} from "./security-test-helpers";

describe.sequential("SEC-RBAC-001/002 Admin route-role matrix", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Express;

  const accountByRole: Record<CanonicalAdminRole, typeof manifest.accounts.admin_active> =
    {
      Admin: manifest.accounts.admin_active,
      Staff: manifest.accounts.staff_active,
      WarehouseStaff: manifest.accounts.warehouse_active,
    };

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../src/apps/admin/admin.app"
    ));
  });

  for (const route of rbacRouteManifest.filter(
    (manifestEntry) => manifestEntry.kind === "read",
  )) {
    test(`SEC-RBAC-001 ${route.id} enforces canonical access on ${route.method.toUpperCase()} route`, async () => {
      const path = route.path(manifest);

      const anonymousResponse = await sendApiRequest(
        adminApp,
        route.method,
        path,
      );
      expect(anonymousResponse.status).toBe(401);

      const customerResponse = await withFixtureAuthorization(
        sendApiRequest(adminApp, route.method, path),
        createFixtureToken(manifest.accounts.customer_active),
      );
      expect(customerResponse.status).toBe(403);

      const unknownRoleResponse = await withFixtureAuthorization(
        sendApiRequest(adminApp, route.method, path),
        createFixtureToken(manifest.accounts.unknown_role_active),
      );
      expect(unknownRoleResponse.status).toBe(403);

      for (const role of canonicalAdminRoles) {
        const response = await withFixtureAuthorization(
          sendApiRequest(adminApp, route.method, path),
          createFixtureToken(accountByRole[role]),
        );

        if (route.allowedRoles.includes(role)) {
          expect(
            [400, 401, 403, 404, 500],
            `${route.id}: ${role} received ${response.status}`,
          ).not.toContain(response.status);
          expect(response.status).toBeLessThan(500);
        } else {
          expect(
            response.status,
            `${route.id}: ${role} must be denied`,
          ).toBe(403);
        }
      }
    });
  }

  for (const route of rbacRouteManifest.filter(
    (manifestEntry) => manifestEntry.kind === "mutation",
  )) {
    test(`SEC-RBAC-002 ${route.id} rejects unauthorized mutation before business processing`, async () => {
      const path = route.path(manifest);
      const before = await captureSecurityDatabaseState();

      const anonymousResponse = await sendApiRequest(
        adminApp,
        route.method,
        path,
      ).send(route.invalidBody ?? {});
      expect(anonymousResponse.status).toBe(401);

      const customerResponse = await withFixtureAuthorization(
        sendApiRequest(adminApp, route.method, path),
        createFixtureToken(manifest.accounts.customer_active),
      ).send(route.invalidBody ?? {});
      expect(customerResponse.status).toBe(403);

      const unknownRoleResponse = await withFixtureAuthorization(
        sendApiRequest(adminApp, route.method, path),
        createFixtureToken(manifest.accounts.unknown_role_active),
      ).send(route.invalidBody ?? {});
      expect(unknownRoleResponse.status).toBe(403);

      for (const role of route.disallowedRoles) {
        const response = await withFixtureAuthorization(
          sendApiRequest(adminApp, route.method, path),
          createFixtureToken(accountByRole[role]),
        ).send(route.invalidBody ?? {});

        expect.soft(
          response.status,
          `${route.id}: ${role} reached validation/controller instead of RBAC`,
        ).toBe(403);
      }

      expect(await captureSecurityDatabaseState()).toEqual(before);
    });
  }
});
