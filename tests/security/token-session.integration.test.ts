import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, inject, test } from "vitest";
import prisma from "../../src/utils/prisma";
import {
  AUTH_TEST_PASSWORD,
  restoreAuthAccount,
} from "../factories/auth.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../setup/database-safety";
import { expectSafeAuthResponse } from "../api/auth/auth-test-helpers";

describe.sequential("Admin stale privilege integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Awaited<
    typeof import("../../src/apps/admin/admin.app")
  >["default"];

  async function restoreMutableFixtures() {
    await Promise.all([
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.admin_active.userId,
        roleName: "Admin",
        status: 1,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.staff_active.userId,
        roleName: "Staff",
        status: 1,
      }),
    ]);
  }

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import("../../src/apps/admin/admin.app"));
  });

  beforeEach(restoreMutableFixtures);
  afterEach(restoreMutableFixtures);

  test("SEC-AUTH-004-STATUS rejects an old Admin token immediately after account becomes inactive", async () => {
    const account = manifest.accounts.admin_active;
    const loginResponse = await request(adminApp)
      .post("/api/admin/auth/login")
      .send({
        identifier: account.userName,
        password: AUTH_TEST_PASSWORD,
      });
    expect(loginResponse.status).toBe(200);

    await prisma.users.update({
      where: { user_id: account.userId },
      data: { status: 0 },
    });
    expect(
      await prisma.users.findUnique({ where: { user_id: account.userId } }),
    ).toMatchObject({ status: 0 });
    const productsBefore = await prisma.products.count();

    const response = await request(adminApp)
      .get("/api/admin/products")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);
    expect(
      await prisma.users.findUnique({ where: { user_id: account.userId } }),
    ).toMatchObject({ status: 0 });
    expect(await prisma.products.count()).toBe(productsBefore);
    expectSafeAuthResponse(response.body);
  });

  test("SEC-AUTH-004-ROLE does not retain Staff product privilege after database role changes to Customer", async () => {
    const account = manifest.accounts.staff_active;
    const loginResponse = await request(adminApp)
      .post("/api/admin/auth/login")
      .send({
        identifier: account.userName,
        password: AUTH_TEST_PASSWORD,
      });
    expect(loginResponse.status).toBe(200);

    const customerRole = await prisma.roles.findUnique({
      where: { role_name: "Customer" },
    });
    expect(customerRole).not.toBeNull();
    await prisma.users.update({
      where: { user_id: account.userId },
      data: { role_id: customerRole!.role_id },
    });
    const changedUser = await prisma.users.findUnique({
      where: { user_id: account.userId },
      include: { roles: true },
    });
    expect(changedUser?.roles.role_name).toBe("Customer");
    const productsBefore = await prisma.products.count();

    const response = await request(adminApp)
      .get("/api/admin/products")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);
    const userAfterRequest = await prisma.users.findUnique({
      where: { user_id: account.userId },
      include: { roles: true },
    });
    expect(userAfterRequest?.roles.role_name).toBe("Customer");
    expect(await prisma.products.count()).toBe(productsBefore);
    expectSafeAuthResponse(response.body);
  });
});
