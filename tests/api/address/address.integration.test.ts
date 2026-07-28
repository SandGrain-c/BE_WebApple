import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../../src/utils/prisma";
import {
  createAddressFixture,
  createIsolatedCustomer,
} from "../../factories/cart-address.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import {
  createFixtureToken,
  expectNoCustomerBDisclosure,
} from "../../security/security-test-helpers";

const ADDRESS_KEYS = [
  "addressId",
  "city",
  "detailedAddress",
  "fullAddress",
  "isDefault",
  "receiverName",
  "receiverPhone",
  "userId",
  "ward",
].sort();

function expectSafeAddressShape(body: Record<string, unknown>) {
  expect(Object.keys(body).sort()).toEqual(ADDRESS_KEYS);
  const serialized = JSON.stringify(body);

  for (const internalKey of [
    "address_id",
    "user_id",
    "receiver_name",
    "receiver_phone",
    "detailed_address",
    "is_default",
    "pass_hash",
  ]) {
    expect(serialized).not.toContain(`"${internalKey}"`);
  }
}

describe.sequential("Address business rules integration", () => {
  const manifest = inject("fixtureManifest");
  let customerApp: Express;

  const authorize = (apiRequest: Test, token: string) =>
    apiRequest.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  test("ADDR-API-001 anonymous requests are rejected before address processing", async () => {
    const responses = [
      await request(customerApp).get("/api/user/addresses"),
      await request(customerApp).post("/api/user/addresses").send({}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false });
    }
  });

  test("ADDR-API-002 Customer A lists only own addresses without Customer B PII", async () => {
    const token = createFixtureToken(manifest.accounts.customer_active);
    const response = await authorize(
      request(customerApp).get("/api/user/addresses"),
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);

    for (const address of response.body.data) {
      expect(address.userId).toBe(
        manifest.accounts.customer_active.userId,
      );
      expectSafeAddressShape(address);
    }

    expect(response.body.data.map((address: { addressId: number }) =>
      address.addressId,
    )).toEqual(
      expect.arrayContaining([
        manifest.ownership.address_a.addressId,
        manifest.ownership.address_a_secondary.addressId,
      ]),
    );
    expectNoCustomerBDisclosure(response.body, [
      manifest.ownership.address_b.receiverName,
      manifest.ownership.address_b.receiverPhone,
      manifest.ownership.address_b.detailedAddress,
    ]);
  });

  test("ADDR-API-003 valid create uses authenticated owner and ignores body userId", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrcreate");
    await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "addrcreatebase",
      isDefault: true,
    });
    const customerBAddressBefore = await prisma.user_addresses.findUnique({
      where: { address_id: manifest.ownership.address_b.addressId },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).post("/api/user/addresses"),
      token,
    ).send({
      receiverName: "  Created Receiver  ",
      receiverPhone: "  0901234567  ",
      detailedAddress: "  100 Test Street  ",
      ward: "  Test Ward  ",
      city: "  Test City  ",
      isDefault: false,
      userId: manifest.accounts.customer_b.userId,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        userId: customer.user.user_id,
        receiverName: "Created Receiver",
        receiverPhone: "0901234567",
        detailedAddress: "100 Test Street",
        ward: "Test Ward",
        city: "Test City",
        isDefault: false,
      },
    });
    expectSafeAddressShape(response.body.data);

    const stored = await prisma.user_addresses.findUnique({
      where: { address_id: response.body.data.addressId },
    });
    expect(stored).toMatchObject({
      user_id: customer.user.user_id,
      receiver_name: "Created Receiver",
      receiver_phone: "0901234567",
      detailed_address: "100 Test Street",
      ward: "Test Ward",
      city: "Test City",
      is_default: false,
    });
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: manifest.ownership.address_b.addressId },
      }),
    ).toEqual(customerBAddressBefore);
  });

  test("ADDR-API-004 missing and whitespace-only required fields create no record", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrinvalid");
    await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "addrinvalidbase",
      isDefault: true,
    });
    const token = createFixtureToken(customer.account);
    const validPayload = {
      receiverName: "Receiver",
      receiverPhone: "0901234567",
      detailedAddress: "100 Test Street",
      ward: "Test Ward",
      city: "Test City",
    };
    const invalidPayloads: Array<Record<string, unknown>> = [
      { ...validPayload, receiverName: "   " },
      { ...validPayload, receiverPhone: "   " },
      { ...validPayload, detailedAddress: "   " },
      { ...validPayload, ward: "   " },
      { ...validPayload, city: "   " },
      {
        receiverName: validPayload.receiverName,
        receiverPhone: validPayload.receiverPhone,
        detailedAddress: validPayload.detailedAddress,
        ward: validPayload.ward,
      },
    ];
    const beforeCount = await prisma.user_addresses.count({
      where: { user_id: customer.user.user_id },
    });

    for (const payload of invalidPayloads) {
      const response = await authorize(
        request(customerApp).post("/api/user/addresses"),
        token,
      ).send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false });
    }

    expect(
      await prisma.user_addresses.count({
        where: { user_id: customer.user.user_id },
      }),
    ).toBe(beforeCount);
  });

  test("ADDR-API-005 setting default is owner-scoped, unique and idempotent", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrdefault");
    const oldDefault = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "olddefault",
      isDefault: true,
    });
    const nextDefault = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "nextdefault",
      isDefault: false,
    });
    const other = await createIsolatedCustomer(prisma, "addrother");
    const otherDefault = await createAddressFixture(prisma, {
      userId: other.user.user_id,
      label: "otherdefault",
      isDefault: true,
    });
    const otherBefore = await prisma.user_addresses.findUnique({
      where: { address_id: otherDefault.address_id },
    });
    const token = createFixtureToken(customer.account);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await authorize(
        request(customerApp).patch(
          `/api/user/addresses/${nextDefault.address_id}/default`,
        ),
        token,
      );
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        addressId: nextDefault.address_id,
        isDefault: true,
      });
    }

    const rows = await prisma.user_addresses.findMany({
      where: { user_id: customer.user.user_id },
      orderBy: { address_id: "asc" },
    });
    expect(rows.filter((address) => address.is_default)).toHaveLength(1);
    expect(
      rows.find((address) => address.address_id === oldDefault.address_id)
        ?.is_default,
    ).toBe(false);
    expect(
      rows.find((address) => address.address_id === nextDefault.address_id)
        ?.is_default,
    ).toBe(true);
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: otherDefault.address_id },
      }),
    ).toEqual(otherBefore);
  });

  test("ADDR-API-006 partial update changes only supplied fields and cannot transfer owner", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrpartial");
    const other = await createIsolatedCustomer(prisma, "addrpartialb");
    const address = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "partialtarget",
      isDefault: true,
    });
    const otherAddress = await createAddressFixture(prisma, {
      userId: other.user.user_id,
      label: "partialother",
      isDefault: true,
    });
    const otherBefore = await prisma.user_addresses.findUnique({
      where: { address_id: otherAddress.address_id },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).patch(
        `/api/user/addresses/${address.address_id}`,
      ),
      token,
    ).send({
      receiverName: "  Updated Receiver  ",
      userId: other.user.user_id,
      isDefault: false,
    });

    expect(response.status).toBe(200);
    const stored = await prisma.user_addresses.findUnique({
      where: { address_id: address.address_id },
    });
    expect(stored).toMatchObject({
      user_id: customer.user.user_id,
      receiver_name: "Updated Receiver",
      receiver_phone: address.receiver_phone,
      detailed_address: address.detailed_address,
      ward: address.ward,
      city: address.city,
      is_default: true,
    });
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: otherAddress.address_id },
      }),
    ).toEqual(otherBefore);
  });

  test("ADDR-API-007 invalid partial update leaves the row unchanged", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrupinvalid");
    const address = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "upinvalidtarget",
      isDefault: true,
    });
    const before = await prisma.user_addresses.findUnique({
      where: { address_id: address.address_id },
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).patch(
        `/api/user/addresses/${address.address_id}`,
      ),
      token,
    ).send({ detailedAddress: "   " });

    expect(response.status).toBe(400);
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: address.address_id },
      }),
    ).toEqual(before);
  });

  test("ADDR-API-008 update isDefault=true preserves exactly one default", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrupdateflag");
    const oldDefault = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "flagold",
      isDefault: true,
    });
    const target = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "flagtarget",
      isDefault: false,
    });
    const token = createFixtureToken(customer.account);

    const response = await authorize(
      request(customerApp).patch(
        `/api/user/addresses/${target.address_id}`,
      ),
      token,
    ).send({ isDefault: true });

    expect(response.status).toBe(200);
    const rows = await prisma.user_addresses.findMany({
      where: { user_id: customer.user.user_id },
    });
    expect(rows.filter((address) => address.is_default)).toHaveLength(1);
    expect(
      rows.find((address) => address.address_id === oldDefault.address_id)
        ?.is_default,
    ).toBe(false);
    expect(
      rows.find((address) => address.address_id === target.address_id)
        ?.is_default,
    ).toBe(true);
  });

  test("ADDR-API-009 deleting a non-default address is owner-scoped and repeat-safe", async () => {
    const customer = await createIsolatedCustomer(prisma, "addrdelete");
    const defaultAddress = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "deletebase",
      isDefault: true,
    });
    const removable = await createAddressFixture(prisma, {
      userId: customer.user.user_id,
      label: "deleteremove",
      isDefault: false,
    });
    const other = await createIsolatedCustomer(prisma, "addrdeleteother");
    const otherAddress = await createAddressFixture(prisma, {
      userId: other.user.user_id,
      label: "deleteother",
      isDefault: true,
    });
    const otherBefore = await prisma.user_addresses.findUnique({
      where: { address_id: otherAddress.address_id },
    });
    const token = createFixtureToken(customer.account);

    const firstResponse = await authorize(
      request(customerApp).delete(
        `/api/user/addresses/${removable.address_id}`,
      ),
      token,
    );
    const secondResponse = await authorize(
      request(customerApp).delete(
        `/api/user/addresses/${removable.address_id}`,
      ),
      token,
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(404);
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: removable.address_id },
      }),
    ).toBeNull();
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: defaultAddress.address_id },
      }),
    ).toMatchObject({ is_default: true });
    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: otherAddress.address_id },
      }),
    ).toEqual(otherBefore);
  });
});
