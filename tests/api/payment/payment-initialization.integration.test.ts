import type { Express } from "express";
import request, { type Test } from "supertest";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  test,
  vi,
} from "vitest";
import { payOS } from "../../../src/config/payos";
import prisma from "../../../src/utils/prisma";
import {
  createPaymentIntegrityScenario,
  snapshotPaymentIntegrity,
} from "../../factories/payment-integrity.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";
import { createFixtureToken } from "../../security/security-test-helpers";

function expectSafeErrorBody(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /pass_hash|JWT_SECRET|PAYOS_(?:API|CHECKSUM)|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE |\/Users\//i,
  );
}

function gatewayLink(orderId: number, amount: number, suffix = "default") {
  return {
    bin: "970422",
    accountNumber: "12345678",
    accountName: "PAYMENT TEST",
    amount,
    description: `DH${orderId}`,
    orderCode: orderId,
    currency: "VND",
    paymentLinkId: `test-link-${orderId}-${suffix}`,
    status: "PENDING",
    checkoutUrl: `https://pay.test.invalid/${orderId}/${suffix}`,
    qrCode: `test-qr-${orderId}-${suffix}`,
  };
}

describe.sequential("PayOS payment initialization integration", () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("PAY-INIT-001 missing and invalid tokens are rejected before payment lookup", async () => {
    const responses = [
      await request(customerApp).post(
        "/api/payment-transactions/payos/orders/1/create-link",
      ),
      await authorize(
        request(customerApp).post(
          "/api/payment-transactions/payos/orders/1/create-link",
        ),
        "invalid-token",
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("PAY-INIT-002 locked customer is rejected before payment lookup", async () => {
    const response = await authorize(
      request(customerApp).post(
        "/api/payment-transactions/payos/orders/1/create-link",
      ),
      createFixtureToken(manifest.accounts.customer_locked),
    );

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false });
  });

  test("PAY-INIT-003 nonexistent and cross-customer orders use an IDOR-safe 404 without mutation", async () => {
    const owner = await createPaymentIntegrityScenario(prisma, {
      label: "initidorowner",
    });
    const otherCustomer = await createPaymentIntegrityScenario(prisma, {
      label: "initidorother",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      owner.order.order_id,
      owner.variant.variant_id,
    );
    const token = createFixtureToken(otherCustomer.customer.account);
    const responses = [
      await authorize(
        request(customerApp).post(
          `/api/payment-transactions/payos/orders/${owner.order.order_id}/create-link`,
        ),
        token,
      ),
      await authorize(
        request(customerApp).post(
          "/api/payment-transactions/payos/orders/2147483647/create-link",
        ),
        token,
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        owner.order.order_id,
        owner.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-INIT-004 malformed path IDs return controlled 400", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initbadid",
    });
    const token = createFixtureToken(scenario.customer.account);
    const responses = await Promise.all(
      ["text", "0", "-1", "1.5"].map((orderId) =>
        authorize(
          request(customerApp).post(
            `/api/payment-transactions/payos/orders/${orderId}/create-link`,
          ),
          token,
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("PAY-INIT-005 cancelled, completed, COD and non-pending orders are ineligible", async () => {
    const inputs = [
      { status: "Cancelled" as const, gateway: "payOS" as const },
      { status: "Completed" as const, gateway: "payOS" as const },
      { status: "PendingConfirmation" as const, gateway: "payOS" as const },
      { status: "PendingPayment" as const, gateway: "COD" as const },
    ];
    const statuses: number[] = [];

    for (const [index, input] of inputs.entries()) {
      const scenario = await createPaymentIntegrityScenario(prisma, {
        label: `initineligible${index}`,
        orderStatus: input.status,
        gateway: input.gateway,
      });
      const response = await authorize(
        request(customerApp).post(
          `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`,
        ),
        createFixtureToken(scenario.customer.account),
      );
      statuses.push(response.status);
    }

    expect(statuses).toEqual([400, 400, 400, 400]);
  });

  test("PAY-INIT-006 an already successful payment cannot be initialized again", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initsuccess",
      paymentStatus: "Success",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await authorize(
      request(customerApp).post(
        `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`,
      ),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(400);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-INIT-007 gateway amount and persisted payment remain server-authoritative despite mass assignment", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initauthority",
      totalAmount: 2_000,
    });
    const createGatewayLink = vi
      .spyOn(payOS.paymentRequests, "create")
      .mockResolvedValue(
        gatewayLink(
          scenario.order.order_id,
          scenario.expected.totalAmount,
          "authority",
        ) as never,
      );
    const response = await authorize(
      request(customerApp)
        .post(
          `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`,
        )
        .send({
          amount: 1,
          userId: manifest.accounts.customer_b.userId,
          status: "Success",
          paidAt: "2020-01-01T00:00:00.000Z",
          transactionRef: "client-controlled",
          gatewayResponse: { secret: "client-controlled" },
          orderStatus: "Completed",
        }),
      createFixtureToken(scenario.customer.account),
    );
    const persisted = await prisma.payment_transactions.findUnique({
      where: { transaction_id: scenario.payment.transaction_id },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe(2_000);
    expect(createGatewayLink).toHaveBeenCalledTimes(1);
    expect(createGatewayLink.mock.calls[0]?.[0]).toMatchObject({
      orderCode: scenario.order.order_id,
      amount: 2_000,
    });
    expect({
      amount: Number(persisted?.amount),
      status: persisted?.status,
      paidAt: persisted?.paid_at,
      transactionRef: persisted?.transaction_ref,
    }).toEqual({
      amount: 2_000,
      status: "Pending",
      paidAt: null,
      transactionRef: `test-link-${scenario.order.order_id}-authority`,
    });
  });

  test("PAY-INIT-008 sequential duplicate initialization reuses one persisted gateway link", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initsequential",
    });
    const createGatewayLink = vi
      .spyOn(payOS.paymentRequests, "create")
      .mockResolvedValue(
        gatewayLink(
          scenario.order.order_id,
          scenario.expected.totalAmount,
          "sequential",
        ) as never,
      );
    const token = createFixtureToken(scenario.customer.account);
    const endpoint = `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`;
    const first = await authorize(request(customerApp).post(endpoint), token);
    const second = await authorize(request(customerApp).post(endpoint), token);
    const payments = await prisma.payment_transactions.findMany({
      where: {
        order_id: scenario.order.order_id,
        gateway: "payOS",
        payment_type: "Payment",
      },
    });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(createGatewayLink).toHaveBeenCalledTimes(1);
    expect(first.body.data.paymentLinkId).toBe(second.body.data.paymentLinkId);
    expect(payments).toHaveLength(1);
  });

  test("PAY-INIT-009 concurrent duplicate initialization invokes the gateway only once", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initconcurrent",
    });
    let gatewayCalls = 0;
    let releaseGateway: (() => void) | undefined;
    const gatewayBarrier = new Promise<void>((resolve) => {
      releaseGateway = resolve;
    });
    const createGatewayLink = vi
      .spyOn(payOS.paymentRequests, "create")
      .mockImplementation(async () => {
        gatewayCalls += 1;
        if (gatewayCalls >= 2) {
          releaseGateway?.();
        }
        await gatewayBarrier;
        return gatewayLink(
          scenario.order.order_id,
          scenario.expected.totalAmount,
          `concurrent-${gatewayCalls}`,
        ) as never;
      });
    const token = createFixtureToken(scenario.customer.account);
    const endpoint = `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`;
    const releaseTimeout = setTimeout(() => releaseGateway?.(), 500);
    const responses = await Promise.all([
      authorize(request(customerApp).post(endpoint), token),
      authorize(request(customerApp).post(endpoint), token),
    ]);
    clearTimeout(releaseTimeout);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(createGatewayLink).toHaveBeenCalledTimes(1);
    expect(
      await prisma.payment_transactions.count({
        where: { order_id: scenario.order.order_id },
      }),
    ).toBe(1);
  });

  test("PAY-INIT-010 unexpected gateway errors return a sanitized public envelope without DB mutation", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initgatewayerror",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    vi.spyOn(payOS.paymentRequests, "create").mockRejectedValue(
      new Error("controlled gateway credential failure"),
    );
    const response = await authorize(
      request(customerApp).post(
        `/api/payment-transactions/payos/orders/${scenario.order.order_id}/create-link`,
      ),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý thanh toán thất bại",
    });
    expectSafeErrorBody(response.body);
    expect(JSON.stringify(response.body)).not.toContain(
      "controlled gateway credential failure",
    );
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-INIT-011 payment status lookup is authenticated and ownership-safe", async () => {
    const owner = await createPaymentIntegrityScenario(prisma, {
      label: "initstatusowner",
    });
    const other = await createPaymentIntegrityScenario(prisma, {
      label: "initstatusother",
    });
    const endpoint = `/api/payment-transactions/payos/orders/${owner.order.order_id}/status`;
    const responses = [
      await request(customerApp).get(endpoint),
      await authorize(request(customerApp).get(endpoint), "invalid-token"),
      await authorize(
        request(customerApp).get(endpoint),
        createFixtureToken(manifest.accounts.customer_locked),
      ),
      await authorize(
        request(customerApp).get(endpoint),
        createFixtureToken(other.customer.account),
      ),
      await authorize(
        request(customerApp).get(endpoint),
        createFixtureToken(owner.customer.account),
      ),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 404, 200,
    ]);
    expect(responses[4]?.body.data).toMatchObject({
      orderId: owner.order.order_id,
      orderStatus: "PendingPayment",
      paymentStatus: "Pending",
      amount: owner.expected.totalAmount,
      paidAt: null,
    });
  });

  test("PAY-INIT-012 customer payment detail does not expose stored raw gateway payload", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "initexposure",
      gatewayResponse: {
        internalTrace: "private-gateway-payload",
        signature: "private-signature",
      },
    });
    const response = await authorize(
      request(customerApp).get(
        `/api/payment-transactions/${scenario.payment.transaction_id}`,
      ),
      createFixtureToken(scenario.customer.account),
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(
      "private-gateway-payload",
    );
    expect(JSON.stringify(response.body)).not.toContain("private-signature");
  });
});
