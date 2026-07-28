import jwt from "jsonwebtoken";
import type { Express } from "express";
import request, { type Test } from "supertest";
import { expect } from "vitest";
import prisma from "../../src/utils/prisma";
import type { AccountFixture } from "../fixtures/fixture-manifest";
import type { SecurityHttpMethod } from "./rbac-route-manifest";

export function createFixtureToken(account: AccountFixture) {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required by security integration tests");
  }

  return jwt.sign(
    {
      userId: account.userId,
      role: account.roleName,
    },
    jwtSecret,
    {
      expiresIn: "15m",
    },
  );
}

export function sendApiRequest(
  app: Express,
  method: SecurityHttpMethod,
  path: string,
): Test {
  switch (method) {
    case "get":
      return request(app).get(path);
    case "post":
      return request(app).post(path);
    case "patch":
      return request(app).patch(path);
    case "delete":
      return request(app).delete(path);
  }
}

export function withFixtureAuthorization(testRequest: Test, token: string) {
  return testRequest.set("Authorization", `Bearer ${token}`);
}

export async function captureSecurityDatabaseState() {
  const [
    usersCount,
    categoriesCount,
    productsCount,
    vouchersCount,
    receiptsCount,
    productItemsCount,
    auditLogsCount,
    bannerRows,
    productImageRows,
    supplierRows,
    variantRows,
    reviewRows,
    orderRows,
    paymentRows,
    shipmentRows,
  ] = await Promise.all([
    prisma.users.count(),
    prisma.categories.count(),
    prisma.products.count(),
    prisma.vouchers.count(),
    prisma.inventory_receipts.count(),
    prisma.product_items.count(),
    prisma.audit_logs.count(),
    prisma.banners.findMany({
      orderBy: { banner_id: "asc" },
      select: {
        banner_id: true,
        title: true,
        image_url: true,
        target_url: true,
        position: true,
        is_active: true,
      },
    }),
    prisma.product_images.findMany({
      orderBy: { image_id: "asc" },
      select: {
        image_id: true,
        is_thumbnail: true,
        is_active: true,
        sort_order: true,
      },
    }),
    prisma.suppliers.findMany({
      orderBy: { supplier_id: "asc" },
      select: {
        supplier_id: true,
        supplier_name: true,
        status: true,
      },
    }),
    prisma.product_variants.findMany({
      orderBy: { variant_id: "asc" },
      select: {
        variant_id: true,
        stock_quantity: true,
      },
    }),
    prisma.reviews.findMany({
      orderBy: { review_id: "asc" },
      select: {
        review_id: true,
        rating: true,
        comment: true,
        is_active: true,
      },
    }),
    prisma.orders.findMany({
      orderBy: { order_id: "asc" },
      select: {
        order_id: true,
        order_status: true,
        voucher_id: true,
      },
    }),
    prisma.payment_transactions.findMany({
      orderBy: { transaction_id: "asc" },
      select: {
        transaction_id: true,
        status: true,
      },
    }),
    prisma.shipments.findMany({
      orderBy: { shipment_id: "asc" },
      select: {
        shipment_id: true,
        status: true,
      },
    }),
  ]);

  return {
    usersCount,
    categoriesCount,
    productsCount,
    vouchersCount,
    receiptsCount,
    productItemsCount,
    auditLogsCount,
    bannerRows,
    productImageRows,
    supplierRows,
    variantRows,
    reviewRows,
    orderRows,
    paymentRows,
    shipmentRows,
  };
}

export function expectNoCustomerBDisclosure(
  body: unknown,
  privateValues: readonly string[],
) {
  const serialized = JSON.stringify(body);

  for (const privateValue of privateValues) {
    expect(serialized).not.toContain(privateValue);
  }
}
