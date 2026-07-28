import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  AUTH_TEST_PASSWORD,
  createAuthAccount,
  restoreAuthAccount,
} from "../../factories/auth.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import {
  expectCanonicalAuthUser,
  expectSafeAuthResponse,
} from "./auth-test-helpers";

describe.sequential("Admin Authentication API integration", () => {
  const manifest = inject("fixtureManifest");
  let adminApp: Awaited<
    typeof import("../../../src/apps/admin/admin.app")
  >["default"];

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: adminApp } = await import(
      "../../../src/apps/admin/admin.app"
    ));
  });

  beforeEach(async () => {
    await Promise.all([
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.customer_active.userId,
        roleName: "Customer",
        status: 1,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.admin_active.userId,
        roleName: "Admin",
        status: 1,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.admin_locked.userId,
        roleName: "Admin",
        status: 0,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.staff_active.userId,
        roleName: "Staff",
        status: 1,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.warehouse_active.userId,
        roleName: "WarehouseStaff",
        status: 1,
      }),
    ]);
  });

  test.each([
    ["TC-ADM-01-API-01", "admin_active"],
    ["TC-ADM-01-API-02", "staff_active"],
    ["TC-ADM-01-API-03", "warehouse_active"],
  ] as const)("%s active %s logs in successfully", async (_id, fixtureKey) => {
    const account = manifest.accounts[fixtureKey];
    const response = await request(adminApp)
      .post("/api/admin/auth/login")
      .send({
        identifier: account.userName,
        password: AUTH_TEST_PASSWORD,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expectCanonicalAuthUser(response.body.data.user, {
      id: account.userId,
      userName: account.userName,
      email: account.email,
      phone: account.phone,
      role: account.roleName,
    });
    expectSafeAuthResponse(response.body);
  });

  test("SEC-AUTH-003-ADM-01 rejects Customer credentials on Admin login", async () => {
    const account = manifest.accounts.customer_active;
    const response = await request(adminApp)
      .post("/api/admin/auth/login")
      .send({
        identifier: account.userName,
        password: AUTH_TEST_PASSWORD,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expectSafeAuthResponse(response.body);
  });

  test("SEC-AUTH-003-ADM-02 rejects inactive Admin, Staff and WarehouseStaff", async () => {
    const inactiveAccounts = [
      manifest.accounts.admin_locked,
      (
        await createAuthAccount(prisma, {
          label: "inactive-staff",
          roleName: "Staff",
          status: 0,
        })
      ).user,
      (
        await createAuthAccount(prisma, {
          label: "inactive-warehouse",
          roleName: "WarehouseStaff",
          status: 0,
        })
      ).user,
    ];

    for (const account of inactiveAccounts) {
      const identifier =
        "userName" in account ? account.userName : account.user_name;
      const userId = "userId" in account ? account.userId : account.user_id;
      const response = await request(adminApp)
        .post("/api/admin/auth/login")
        .send({
          identifier,
          password: AUTH_TEST_PASSWORD,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(
        await prisma.users.findUnique({ where: { user_id: userId } }),
      ).toMatchObject({ status: 0 });
      expectSafeAuthResponse(response.body);
    }
  });

  test("SEC-AUTH-003-ADM-03 rejects wrong Admin password", async () => {
    const account = manifest.accounts.admin_active;
    const beforeUser = await prisma.users.findUnique({
      where: { user_id: account.userId },
      select: {
        user_id: true,
        role_id: true,
        user_name: true,
        full_name: true,
        email: true,
        phone: true,
        status: true,
        created_at: true,
      },
    });
    const response = await request(adminApp)
      .post("/api/admin/auth/login")
      .send({
        identifier: account.userName,
        password: "DefinitelyWrong!2026",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(
      await prisma.users.findUnique({
        where: { user_id: account.userId },
        select: {
          user_id: true,
          role_id: true,
          user_name: true,
          full_name: true,
          email: true,
          phone: true,
          status: true,
          created_at: true,
        },
      }),
    ).toEqual(beforeUser);
    expectSafeAuthResponse(response.body);
  });

  test.each([
    ["TC-ADM-01-API-04", "admin_active"],
    ["TC-ADM-01-API-05", "staff_active"],
    ["TC-ADM-01-API-06", "warehouse_active"],
  ] as const)(
    "%s /me returns canonical fields matching %s login",
    async (_id, fixtureKey) => {
      const account = manifest.accounts[fixtureKey];
      const loginResponse = await request(adminApp)
        .post("/api/admin/auth/login")
        .send({
          identifier: account.email,
          password: AUTH_TEST_PASSWORD,
        });
      const meResponse = await request(adminApp)
        .get("/api/admin/auth/me")
        .set(
          "Authorization",
          `Bearer ${loginResponse.body.data.accessToken}`,
        );

      expect(loginResponse.status).toBe(200);
      expect(meResponse.status).toBe(200);
      expect(meResponse.body.data.user).toEqual(loginResponse.body.data.user);
      expectCanonicalAuthUser(meResponse.body.data.user, {
        id: account.userId,
        userName: account.userName,
        email: account.email,
        phone: account.phone,
        role: account.roleName,
      });
      expectSafeAuthResponse(meResponse.body);
    },
  );

  test.each([
    {
      id: "SEC-AUTH-001-ADM-MISSING",
      authorization: undefined,
    },
    {
      id: "SEC-AUTH-002-ADM-MALFORMED",
      authorization: "Bearer not-a-jwt",
    },
    {
      id: "SEC-AUTH-002-ADM-WRONG-SIGNATURE",
      authorization: `Bearer ${jwt.sign(
        {
          userId: manifest.accounts.admin_active.userId,
          role: "Admin",
        },
        "wrong-test-signing-key",
      )}`,
    },
    {
      id: "SEC-AUTH-002-ADM-EXPIRED",
      authorization: `Bearer ${jwt.sign(
        {
          userId: manifest.accounts.admin_active.userId,
          role: "Admin",
        },
        process.env.JWT_SECRET!,
        { expiresIn: -1 },
      )}`,
    },
  ])("$id returns 401 from Admin /me", async ({ authorization }) => {
    const apiRequest = request(adminApp).get("/api/admin/auth/me");

    if (authorization) {
      apiRequest.set("Authorization", authorization);
    }

    const response = await apiRequest;

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expectSafeAuthResponse(response.body);
  });
});
