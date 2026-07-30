import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  AUTH_TEST_PASSWORD,
  createRegistrationPayload,
  restoreAuthAccount,
} from "../../factories/auth.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import {
  expectCanonicalAuthUser,
  expectSafeAuthResponse,
} from "./auth-test-helpers";

describe.sequential("Customer Authentication API integration", () => {
  const manifest = inject("fixtureManifest");
  let customerApp: Awaited<
    typeof import("../../../src/apps/customer/customer.app")
  >["default"];

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
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
        userId: manifest.accounts.customer_locked.userId,
        roleName: "Customer",
        status: 0,
      }),
    ]);
  });

  function getUnrelatedCustomerSnapshot() {
    return prisma.users.findUnique({
      where: { user_id: manifest.accounts.customer_b.userId },
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
  }

  test("TC-CUS-01-API-01 registers Customer with correct role, hashed password and safe response", async () => {
    const payload = createRegistrationPayload("register-valid");
    const response = await request(customerApp)
      .post("/api/auth/register")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expectSafeAuthResponse(response.body);

    const createdUser = await prisma.users.findUnique({
      where: { user_name: payload.userName },
      include: { roles: true },
    });

    expect(createdUser).not.toBeNull();
    expect(createdUser?.roles.role_name).toBe("Customer");
    expect(createdUser?.pass_hash).not.toBe(payload.password);
    expect(await bcrypt.compare(payload.password, createdUser!.pass_hash)).toBe(
      true,
    );
    expectCanonicalAuthUser(response.body.data.user, {
      id: createdUser!.user_id,
      userName: payload.userName,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      role: "Customer",
    });
  });

  test("TC-CUS-01-API-02 rejects duplicate username without creating a user", async () => {
    const payload = createRegistrationPayload("duplicate-username");
    payload.userName = manifest.accounts.customer_active.userName;
    const beforeCount = await prisma.users.count();
    const unrelatedBefore = await getUnrelatedCustomerSnapshot();
    const response = await request(customerApp)
      .post("/api/auth/register")
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(await prisma.users.count()).toBe(beforeCount);
    expect(await getUnrelatedCustomerSnapshot()).toEqual(unrelatedBefore);
    expectSafeAuthResponse(response.body);
  });

  test("TC-CUS-01-API-03 rejects duplicate email without creating a user", async () => {
    const payload = createRegistrationPayload("duplicate-email");
    payload.email = manifest.accounts.customer_active.email;
    const beforeCount = await prisma.users.count();
    const unrelatedBefore = await getUnrelatedCustomerSnapshot();
    const response = await request(customerApp)
      .post("/api/auth/register")
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(await prisma.users.count()).toBe(beforeCount);
    expect(await getUnrelatedCustomerSnapshot()).toEqual(unrelatedBefore);
    expectSafeAuthResponse(response.body);
  });

  test("TC-CUS-01-API-04 rejects duplicate phone without creating a user", async () => {
    const payload = createRegistrationPayload("duplicate-phone");
    payload.phone = manifest.accounts.customer_active.phone;
    const beforeCount = await prisma.users.count();
    const unrelatedBefore = await getUnrelatedCustomerSnapshot();
    const response = await request(customerApp)
      .post("/api/auth/register")
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(await prisma.users.count()).toBe(beforeCount);
    expect(await getUnrelatedCustomerSnapshot()).toEqual(unrelatedBefore);
    expectSafeAuthResponse(response.body);
  });

  test("TC-CUS-01-API-05 rejects missing or invalid registration fields without DB inserts", async () => {
    const basePayload = createRegistrationPayload("invalid-register");
    const invalidPayloads = [
      { ...basePayload, userName: "" },
      { ...basePayload, fullName: "" },
      { ...basePayload, email: null, phone: null },
      { ...basePayload, password: "short" },
    ];
    const beforeCount = await prisma.users.count();
    const unrelatedBefore = await getUnrelatedCustomerSnapshot();

    for (const payload of invalidPayloads) {
      const response = await request(customerApp)
        .post("/api/auth/register")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expectSafeAuthResponse(response.body);
    }

    expect(await prisma.users.count()).toBe(beforeCount);
    expect(await getUnrelatedCustomerSnapshot()).toEqual(unrelatedBefore);
  });

  test("TC-CUS-01-API-06 active Customer logs in with safe canonical response", async () => {
    const account = manifest.accounts.customer_active;
    const response = await request(customerApp).post("/api/auth/login").send({
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
      role: "Customer",
    });
    expectSafeAuthResponse(response.body);
  });

  test("SEC-AUTH-003-CUS-01 rejects wrong Customer password", async () => {
    const account = manifest.accounts.customer_active;
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
    const response = await request(customerApp).post("/api/auth/login").send({
      identifier: account.userName,
      password: "DefinitelyWrong!2026",
    });

    expect(response.status).toBe(401);
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

  test("SEC-AUTH-003-CUS-02 rejects inactive Customer credentials", async () => {
    const account = manifest.accounts.customer_locked;
    const response = await request(customerApp).post("/api/auth/login").send({
      identifier: account.userName,
      password: AUTH_TEST_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(
      await prisma.users.findUnique({ where: { user_id: account.userId } }),
    ).toMatchObject({ status: 0 });
    expectSafeAuthResponse(response.body);
  });

  test("TC-CUS-01-API-07 valid token returns the same safe Customer from /auth/me", async () => {
    const account = manifest.accounts.customer_active;
    const loginResponse = await request(customerApp)
      .post("/api/auth/login")
      .send({
        identifier: account.email,
        password: AUTH_TEST_PASSWORD,
      });
    const meResponse = await request(customerApp)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

    expect(loginResponse.status).toBe(200);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user).toEqual(loginResponse.body.data.user);
    expectCanonicalAuthUser(meResponse.body.data.user, {
      id: account.userId,
      userName: account.userName,
      email: account.email,
      phone: account.phone,
      role: "Customer",
    });
    expectSafeAuthResponse(meResponse.body);
  });

  test.each([
    {
      id: "SEC-AUTH-001-CUS-MISSING",
      authorization: undefined,
    },
    {
      id: "SEC-AUTH-002-CUS-MALFORMED",
      authorization: "Bearer not-a-jwt",
    },
    {
      id: "SEC-AUTH-002-CUS-WRONG-SIGNATURE",
      authorization: `Bearer ${jwt.sign(
        {
          userId: manifest.accounts.customer_active.userId,
          role: "Customer",
        },
        "wrong-test-signing-key",
      )}`,
    },
    {
      id: "SEC-AUTH-002-CUS-EXPIRED",
      authorization: `Bearer ${jwt.sign(
        {
          userId: manifest.accounts.customer_active.userId,
          role: "Customer",
        },
        process.env.JWT_SECRET!,
        { expiresIn: -1 },
      )}`,
    },
  ])("$id returns 401 from Customer /auth/me", async ({ authorization }) => {
    const apiRequest = request(customerApp).get("/api/auth/me");

    if (authorization) {
      apiRequest.set("Authorization", authorization);
    }

    const response = await apiRequest;

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expectSafeAuthResponse(response.body);
  });
});
