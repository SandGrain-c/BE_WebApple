import type { Express } from "express";
import request, { type Test } from "supertest";
import { beforeAll, describe, expect, inject, test } from "vitest";
import prisma from "../../src/utils/prisma";
import { assertCurrentProcessUsesSafeTestDatabase } from "../setup/database-safety";
import {
  createFixtureToken,
  expectNoCustomerBDisclosure,
} from "./security-test-helpers";

describe.sequential("Customer ownership and IDOR integration", () => {
  const manifest = inject("fixtureManifest");
  const customerAToken = createFixtureToken(
    manifest.accounts.customer_active,
  );
  let customerApp: Express;

  const authorize = (apiRequest: Test) =>
    apiRequest.set("Authorization", `Bearer ${customerAToken}`);

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../src/apps/customer/customer.app"
    ));
  });

  test("SEC-IDOR-001 Customer A cannot read, update, default or delete Customer B address", async () => {
    const address = manifest.ownership.address_b;
    const before = await prisma.user_addresses.findUnique({
      where: { address_id: address.addressId },
    });
    expect(before).not.toBeNull();

    const responses = [
      await authorize(
        request(customerApp).get(
          `/api/user/addresses/${address.addressId}`,
        ),
      ),
      await authorize(
        request(customerApp)
          .patch(`/api/user/addresses/${address.addressId}`)
          .send({
            receiverName: "Unauthorized replacement",
            receiverPhone: "0999999999",
            detailedAddress: "Unauthorized address",
            ward: "Unauthorized ward",
            city: "Unauthorized city",
          }),
      ),
      await authorize(
        request(customerApp).patch(
          `/api/user/addresses/${address.addressId}/default`,
        ),
      ),
      await authorize(
        request(customerApp).delete(
          `/api/user/addresses/${address.addressId}`,
        ),
      ),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expectNoCustomerBDisclosure(response.body, [
        address.receiverName,
        address.receiverPhone,
        address.detailedAddress,
      ]);
    }

    expect(
      await prisma.user_addresses.findUnique({
        where: { address_id: address.addressId },
      }),
    ).toEqual(before);
  });

  test("SEC-IDOR-002 Customer A cannot mutate Customer B cart item", async () => {
    const cartItem = manifest.ownership.cart_item_b;
    const before = await prisma.cart_items.findUnique({
      where: { cart_item_id: cartItem.cartItemId },
    });
    expect(before).toMatchObject({
      quantity: cartItem.quantity,
      selected: cartItem.selected,
    });

    const responses = [
      await authorize(
        request(customerApp)
          .patch(`/api/cart/items/${cartItem.cartItemId}`)
          .send({ quantity: 7 }),
      ),
      await authorize(
        request(customerApp)
          .patch(`/api/cart/items/${cartItem.cartItemId}/selected`)
          .send({ selected: !cartItem.selected }),
      ),
      await authorize(
        request(customerApp).delete(
          `/api/cart/items/${cartItem.cartItemId}`,
        ),
      ),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
    }

    expect(
      await prisma.cart_items.findUnique({
        where: { cart_item_id: cartItem.cartItemId },
      }),
    ).toEqual(before);
  });

  test("SEC-IDOR-003 Customer A cannot read or cancel Customer B order", async () => {
    const ownership = manifest.ownership;
    const before = await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: ownership.order_b.orderId },
      }),
      prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { stock_quantity: true },
      }),
      prisma.vouchers.findUnique({
        where: { voucher_id: ownership.voucher_b.voucherId },
      }),
      prisma.voucher_usages.count({
        where: { order_id: ownership.order_b.orderId },
      }),
      prisma.order_status_history.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { history_id: "asc" },
      }),
      prisma.payment_transactions.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { transaction_id: "asc" },
      }),
      prisma.shipments.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { shipment_id: "asc" },
      }),
    ]);

    const detailResponse = await authorize(
      request(customerApp).get(
        `/api/orders/${ownership.order_b.orderId}`,
      ),
    );
    const cancelResponse = await authorize(
      request(customerApp).patch(
        `/api/orders/${ownership.order_b.orderId}/cancel`,
      ),
    );

    expect(detailResponse.status).toBe(404);
    expect(cancelResponse.status).toBe(404);
    for (const response of [detailResponse, cancelResponse]) {
      expectNoCustomerBDisclosure(response.body, [
        ownership.order_b.orderCode,
        ownership.payment_b.transactionRef,
        ownership.shipment_b.trackingCode,
        ownership.address_b.receiverPhone,
        ownership.address_b.detailedAddress,
      ]);
    }

    const after = await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: ownership.order_b.orderId },
      }),
      prisma.product_variants.findUnique({
        where: {
          variant_id: manifest.catalog.variant_stock_10.variantId,
        },
        select: { stock_quantity: true },
      }),
      prisma.vouchers.findUnique({
        where: { voucher_id: ownership.voucher_b.voucherId },
      }),
      prisma.voucher_usages.count({
        where: { order_id: ownership.order_b.orderId },
      }),
      prisma.order_status_history.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { history_id: "asc" },
      }),
      prisma.payment_transactions.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { transaction_id: "asc" },
      }),
      prisma.shipments.findMany({
        where: { order_id: ownership.order_b.orderId },
        orderBy: { shipment_id: "asc" },
      }),
    ]);
    expect(after).toEqual(before);
  });

  test("SEC-IDOR-004 Customer A cannot read Customer B payment or shipment", async () => {
    const ownership = manifest.ownership;
    const paymentBefore = await prisma.payment_transactions.findUnique({
      where: {
        transaction_id: ownership.payment_b.transactionId,
      },
    });
    const shipmentBefore = await prisma.shipments.findUnique({
      where: {
        shipment_id: ownership.shipment_b.shipmentId,
      },
    });

    const responses = [
      {
        operation: "payment by order",
        response: await authorize(
          request(customerApp).get(
            `/api/payment-transactions/orders/${ownership.order_b.orderId}`,
          ),
        ),
      },
      {
        operation: "payment by transaction",
        response: await authorize(
          request(customerApp).get(
            `/api/payment-transactions/${ownership.payment_b.transactionId}`,
          ),
        ),
      },
      {
        operation: "shipment by order",
        response: await authorize(
          request(customerApp).get(
            `/api/shipments/orders/${ownership.order_b.orderId}`,
          ),
        ),
      },
      {
        operation: "shipment by id",
        response: await authorize(
          request(customerApp).get(
            `/api/shipments/${ownership.shipment_b.shipmentId}`,
          ),
        ),
      },
    ];

    for (const { operation, response } of responses) {
      expect.soft(response.status, operation).toBe(404);
      expectNoCustomerBDisclosure(response.body, [
        ownership.payment_b.transactionRef,
        ownership.shipment_b.trackingCode,
        ownership.address_b.receiverName,
        ownership.address_b.receiverPhone,
        ownership.address_b.detailedAddress,
      ]);
    }

    expect(
      await prisma.payment_transactions.findUnique({
        where: {
          transaction_id: ownership.payment_b.transactionId,
        },
      }),
    ).toEqual(paymentBefore);
    expect(
      await prisma.shipments.findUnique({
        where: {
          shipment_id: ownership.shipment_b.shipmentId,
        },
      }),
    ).toEqual(shipmentBefore);
  });

  test("SEC-IDOR-005 Customer A cannot update or delete Customer B review", async () => {
    const review = manifest.ownership.review_b;
    const before = await prisma.reviews.findUnique({
      where: { review_id: review.reviewId },
    });
    expect(before).toMatchObject({
      rating: review.rating,
      comment: review.comment,
      is_active: review.isActive,
    });

    const updateResponse = await authorize(
      request(customerApp)
        .patch(`/api/reviews/${review.reviewId}`)
        .send({
          rating: 1,
          comment: "Unauthorized review replacement",
        }),
    );
    const deleteResponse = await authorize(
      request(customerApp).delete(`/api/reviews/${review.reviewId}`),
    );

    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    for (const response of [updateResponse, deleteResponse]) {
      expectNoCustomerBDisclosure(response.body, [review.comment]);
    }

    expect(
      await prisma.reviews.findUnique({
        where: { review_id: review.reviewId },
      }),
    ).toEqual(before);
  });

  test("SEC-IDOR-006 Customer A cannot delete Customer B favorite by product ID", async () => {
    const favorite = manifest.ownership.favorite_b;
    const before = await prisma.favorite_products.findUnique({
      where: { favorite_id: favorite.favoriteId },
    });
    expect(before).not.toBeNull();

    const response = await authorize(
      request(customerApp).delete(
        `/api/favorites/${favorite.productId}`,
      ),
    );

    expect(response.status).toBe(404);
    expect(
      await prisma.favorite_products.findUnique({
        where: { favorite_id: favorite.favoriteId },
      }),
    ).toEqual(before);
  });
});
