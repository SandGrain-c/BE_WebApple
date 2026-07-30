import type { Express } from "express";
import request, { type Test } from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createCheckoutScenario,
  createVoucherFixture,
  createVoucherUsageFixture,
} from "../../factories/checkout-cod.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

const VALID_FROM = new Date("2026-01-01T00:00:00.000Z");
const VALID_UNTIL = new Date("2027-01-01T00:00:00.000Z");
const BOUNDARY_TIME = new Date("2026-07-29T12:00:00.000Z");

function expectSafeErrorBody(body: unknown) {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /pass_hash|JWT_SECRET|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE /i,
  );
}

describe.sequential("Voucher validation integration", () => {
  let customerApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  afterAll(async () => {
    await prisma.products.updateMany({
      where: { slug: { startsWith: "checkout-product-" } },
      data: { is_active: false },
    });
  });

  test("VOU-API-001 authentication rejects missing and invalid tokens", async () => {
    const responses = [
      await request(customerApp).post("/api/vouchers/validate").send({
        code: "ANY",
        subTotal: 1_000,
      }),
      await authorize(
        request(customerApp).post("/api/vouchers/validate"),
        "invalid-token",
      ).send({
        code: "ANY",
        subTotal: 1_000,
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    for (const response of responses) {
      expect(response.body).toMatchObject({ success: false });
      expectSafeErrorBody(response.body);
    }
  });

  test("VOU-API-002 missing and blank voucher codes return 400", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voumissing",
      items: [],
    });
    const token = createFixtureToken(customer.account);
    const responses = [
      await authorize(
        request(customerApp).post("/api/vouchers/validate"),
        token,
      ).send({ subTotal: 1_000 }),
      await authorize(
        request(customerApp).post("/api/vouchers/validate"),
        token,
      ).send({ code: "   ", subTotal: 1_000 }),
    ];

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    for (const response of responses) {
      expect(response.body).toMatchObject({ success: false });
      expectSafeErrorBody(response.body);
    }
  });

  test("VOU-API-003 non-string and array voucher codes are controlled 400 errors", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voutype",
      items: [],
    });
    const token = createFixtureToken(customer.account);
    const responses = [];

    for (const code of [1234, ["CODE", "CODE"]]) {
      responses.push(
        await authorize(
          request(customerApp).post("/api/vouchers/validate"),
          token,
        ).send({ code, subTotal: 1_000 }),
      );
    }

    expect(
      responses.map((response) => ({
        status: response.status,
        success: response.body.success,
      })),
    ).toEqual([
      { status: 400, success: false },
      { status: 400, success: false },
    ]);
    for (const response of responses) {
      expectSafeErrorBody(response.body);
    }
  });

  test("VOU-API-004 subtotal rejects coercible runtime types", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vousubtype",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vousubtype",
      discountType: "Fixed",
      discountValue: 100,
    });
    const token = createFixtureToken(customer.account);
    const responses = [];

    for (const subTotal of ["1000", true, [1_000]]) {
      responses.push(
        await authorize(
          request(customerApp).post("/api/vouchers/validate"),
          token,
        ).send({ code: voucher.code, subTotal }),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
  });

  test("VOU-API-005 unknown fields cannot mutate voucher state", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voumass",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "voumass",
      discountType: "Fixed",
      discountValue: 250,
    });
    const before = await prisma.vouchers.findUnique({
      where: { voucher_id: voucher.voucher_id },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      token,
    ).send({
      code: voucher.code,
      subTotal: 1_000,
      isActive: false,
      usedCount: 999,
      usageLimit: 0,
      discountValue: 999_999,
      userId: -1,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      subTotal: 1_000,
      discountAmount: 250,
      totalAfterDiscount: 750,
    });
    expect(
      await prisma.vouchers.findUnique({
        where: { voucher_id: voucher.voucher_id },
      }),
    ).toEqual(before);
    expect(
      await prisma.voucher_usages.count({
        where: { voucher_id: voucher.voucher_id },
      }),
    ).toBe(0);
  });

  test("VOU-API-006 nonexistent code returns 404", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vounotfound",
      items: [],
    });
    const token = createFixtureToken(customer.account);
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      token,
    ).send({ code: "VOUCHER-NOT-FOUND", subTotal: 1_000 });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false });
    expectSafeErrorBody(response.body);
  });

  test("VOU-API-007 inactive voucher is rejected", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouinactive",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouinactive",
      isActive: false,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false });
  });

  test("VOU-API-008 voucher before start time is rejected", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voufuture",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "voufuture",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: new Date("2099-12-31T00:00:00.000Z"),
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(400);
  });

  test("VOU-API-009 expired voucher is rejected", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouexpired",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouexpired",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2020-12-31T00:00:00.000Z"),
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(400);
  });

  test("VOU-API-010 exact start and end timestamps are inclusive", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BOUNDARY_TIME);

    try {
      const customer = await createCheckoutScenario(prisma, {
        label: "vouboundary",
        items: [],
      });
      const startsNow = await createVoucherFixture(prisma, {
        label: "voustartnow",
        startDate: BOUNDARY_TIME,
        endDate: VALID_UNTIL,
      });
      const endsNow = await createVoucherFixture(prisma, {
        label: "vouendnow",
        startDate: VALID_FROM,
        endDate: BOUNDARY_TIME,
      });
      const token = createFixtureToken(customer.account);
      const responses = [];

      for (const voucher of [startsNow, endsNow]) {
        responses.push(
          await authorize(
            request(customerApp).post("/api/vouchers/validate"),
            token,
          ).send({ code: voucher.code, subTotal: 1_000 }),
        );
      }

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("VOU-API-011 minimum order boundary rejects below and accepts equal/above", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouminimum",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouminimum",
      discountType: "Fixed",
      discountValue: 100,
      minOrderValue: 1_000,
    });
    const token = createFixtureToken(customer.account);
    const responses = [];

    for (const subTotal of [999, 1_000, 1_001]) {
      responses.push(
        await authorize(
          request(customerApp).post("/api/vouchers/validate"),
          token,
        ).send({ code: voucher.code, subTotal }),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 200, 200,
    ]);
  });

  test("VOU-API-012 percentage and fixed discounts are calculated server-side", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voudiscount",
      items: [],
    });
    const percentage = await createVoucherFixture(prisma, {
      label: "voupercent",
      discountType: "Percent",
      discountValue: 12.5,
    });
    const fixed = await createVoucherFixture(prisma, {
      label: "voufixed",
      discountType: "Fixed",
      discountValue: 333,
    });
    const token = createFixtureToken(customer.account);
    const percentageResponse = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      token,
    ).send({ code: percentage.code, subTotal: 2_000 });
    const fixedResponse = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      token,
    ).send({ code: fixed.code, subTotal: 2_000 });

    expect(percentageResponse.body.data).toMatchObject({
      discountAmount: 250,
      totalAfterDiscount: 1_750,
    });
    expect(fixedResponse.body.data).toMatchObject({
      discountAmount: 333,
      totalAfterDiscount: 1_667,
    });
  });

  test("VOU-API-013 percentage maximum discount cap is enforced", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voucap",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "voucap",
      discountType: "Percent",
      discountValue: 50,
      maxDiscountAmount: 300,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 2_000 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      discountAmount: 300,
      totalAfterDiscount: 1_700,
    });
  });

  test("VOU-API-014 fixed discount cannot exceed subtotal or make total negative", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "voufloor",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "voufloor",
      discountType: "Fixed",
      discountValue: 50_000,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_234 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      discountAmount: 1_234,
      totalAfterDiscount: 0,
    });
  });

  test("VOU-API-015 fractional discount consistently rounds down", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouround",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouround",
      discountType: "Percent",
      discountValue: 12.5,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 999 });

    expect(response.body.data).toMatchObject({
      discountAmount: 124,
      totalAfterDiscount: 875,
    });
  });

  test("VOU-API-016 exhausted global usage limit is rejected", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouexhausted",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouexhausted",
      usageLimit: 3,
      usedCount: 3,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(400);
  });

  test("VOU-API-017 voucher already used by current customer is rejected", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouused",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouused",
      usedCount: 0,
    });
    await createVoucherUsageFixture(prisma, {
      voucherId: voucher.voucher_id,
      userId: customer.user.user_id,
      addressId: customer.address.address_id,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(400);
  });

  test("VOU-API-018 another customer's usage does not block this customer", async () => {
    const customerA = await createCheckoutScenario(prisma, {
      label: "vouusera",
      items: [],
    });
    const customerB = await createCheckoutScenario(prisma, {
      label: "vouuserb",
      items: [],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouotherusage",
      usageLimit: 10,
      usedCount: 0,
    });
    await createVoucherUsageFixture(prisma, {
      voucherId: voucher.voucher_id,
      userId: customerB.user.user_id,
      addressId: customerB.address.address_id,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customerA.account),
    ).send({ code: voucher.code, subTotal: 1_000 });

    expect(response.status).toBe(200);
  });

  test("VOU-API-019 client subtotal cannot override selected-cart subtotal", async () => {
    const customer = await createCheckoutScenario(prisma, {
      label: "vouauthority",
      items: [
        {
          key: "selected",
          price: 2_000,
          stockQuantity: 10,
          quantity: 1,
          selected: true,
        },
        {
          key: "unselected",
          price: 9_000,
          stockQuantity: 10,
          quantity: 1,
          selected: false,
        },
      ],
    });
    const voucher = await createVoucherFixture(prisma, {
      label: "vouauthority",
      discountType: "Percent",
      discountValue: 10,
      minOrderValue: 1_500,
    });
    const response = await authorize(
      request(customerApp).post("/api/vouchers/validate"),
      createFixtureToken(customer.account),
    ).send({ code: voucher.code, subTotal: 100 });

    expect({
      status: response.status,
      data: response.body.data,
    }).toEqual({
      status: 200,
      data: expect.objectContaining({
        subTotal: 2_000,
        discountAmount: 200,
        totalAfterDiscount: 1_800,
      }),
    });
  });
});
